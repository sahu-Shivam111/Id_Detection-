// services/trackingService.js

const isValidBox = (box) =>
  Number.isFinite(box?.x) &&
  Number.isFinite(box?.y) &&
  Number.isFinite(box?.width) &&
  Number.isFinite(box?.height) &&
  box.width > 0 &&
  box.height > 0;

const corners = (box) => ({
  left: box.x - box.width / 2,
  right: box.x + box.width / 2,
  top: box.y - box.height / 2,
  bottom: box.y + box.height / 2,
});

const iou = (first, second) => {
  if (!isValidBox(first) || !isValidBox(second)) return 0;

  const a = corners(first);
  const b = corners(second);

  const width = Math.max(
    0,
    Math.min(a.right, b.right) - Math.max(a.left, b.left)
  );

  const height = Math.max(
    0,
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  );

  const intersection = width * height;
  const union =
    first.width * first.height +
    second.width * second.height -
    intersection;

  return union > 0 ? intersection / union : 0;
};

const intersectionArea = (first, second) => {
  const a = corners(first);
  const b = corners(second);
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
};

const overlapOfSmaller = (first, second) => {
  if (!isValidBox(first) || !isValidBox(second)) return 0;

  const smallerArea = Math.min(
    first.width * first.height,
    second.width * second.height
  );
  return smallerArea > 0
    ? intersectionArea(first, second) / smallerArea
    : 0;
};

const OCCLUSION_OVERLAP = 0.35;
const RECOVER_MIN_HEIGHT_RATIO = 0.25;
const RECOVER_MIN_WIDTH_RATIO = 0.15;
const RECOVER_DISTANCE_PER_FRAME = 0.75;
const RECOVER_MAX_ELAPSED_FRAMES = 2;
const RECOVER_MAX_FRAME_DELTA = 2;
const MIN_TRACK_FRAMES = 2;
const MIN_ID_FRAMES = 2;
const MIN_NO_ID_FRAMES = 3;

const verdictFor = (track) => {
  if (track.seenCount < MIN_TRACK_FRAMES) return "ignored";
  if (track.activeRemovalPeriod || track.removalEvent) return "possible_removal";
  if (track.visibleFrames >= MIN_ID_FRAMES) return "id_worn";
  if (track.noIdFrames >= MIN_NO_ID_FRAMES && track.visibleFrames === 0) {
    return "no_id";
  }
  return "unverified";
};

const stateForTrackFrame = (track, detection, frameNumber) => {
  if (track.verdict === "no_id") return "missing";
  if (detection.state !== "suspected") return detection.state;

  const isRemovalFrame = (track.removalPeriods || []).some(
    (period) =>
      frameNumber >= period.startFrame &&
      (period.endFrame === null || frameNumber <= period.endFrame)
  );
  return isRemovalFrame ? "missing" : detection.state;
};

class PersonTracker {
  constructor({
    minIou = 0.2,

    // Maximum number of successful analyzed frames where a track
    // may be absent before it can no longer be matched.
    maxGap = 5,

    // Your extraction interval, in seconds.
    interval = 1,

    // Also stop matching a track after this much video time.
    // This prevents a track from remaining eligible indefinitely
    // when many Workflow requests fail.
    maxUnobservedSeconds = 6,

    // Treat unknown as breaking a consecutive not-visible streak.
    unknownResetsStreak = true,
  } = {}) {
    if (!Number.isFinite(minIou) || minIou < 0 || minIou > 1) {
      throw new Error("minIou must be between 0 and 1.");
    }

    if (!Number.isInteger(maxGap) || maxGap < 0) {
      throw new Error("maxGap must be a non-negative integer.");
    }

    if (!Number.isFinite(interval) || interval <= 0) {
      throw new Error("interval must be greater than zero.");
    }

    if (
      !Number.isFinite(maxUnobservedSeconds) ||
      maxUnobservedSeconds <= 0
    ) {
      throw new Error("maxUnobservedSeconds must be greater than zero.");
    }

    this.minIou = minIou;
    this.maxGap = maxGap;
    this.interval = interval;
    this.maxUnobservedSeconds = maxUnobservedSeconds;
    this.unknownResetsStreak = unknownResetsStreak;

    // Keep every track here so your inspection service can summarize
    // people who left the scene before the final frame.
    this.tracks = [];
    this.nextId = 1;

    this.lastUpdateFrame = 0;
    this.lastUpdateSeq = 0;
  }

  /**
   * Predict where a track's center may be, using its last measured
   * velocity. Velocity is measured in pixels per sampled frame.
   */
  predictedBox(track, frameNumber) {
    const elapsedFrames = frameNumber - track.lastFrame;

    return {
      ...track.box,
      x: track.box.x + track.velocityX * elapsedFrames,
      y: track.box.y + track.velocityY * elapsedFrames,
    };
  }

  /**
   * Higher score means a better match. Zero means no match.
   *
   * This uses box overlap, approximate movement, and size similarity.
   * It is still a heuristic: crossing people can exchange identities.
   */
  score(track, box, frameNumber) {
    if (!isValidBox(track.box) || !isValidBox(box)) return 0;

    const elapsedFrames = frameNumber - track.lastFrame;
    const elapsedSeconds = elapsedFrames * this.interval;

    if (
      elapsedFrames <= 0 ||
      elapsedSeconds > this.maxUnobservedSeconds
    ) {
      return 0;
    }

    const previous = track.box;
    const predicted = this.predictedBox(track, frameNumber);

    const heightRatio =
      Math.min(previous.height, box.height) /
      Math.max(previous.height, box.height);

    const widthRatio =
      Math.min(previous.width, box.width) /
      Math.max(previous.width, box.width);

    // Reject extreme size changes, which often indicate a different person.
    // This can also split a track when a person is heavily occluded.
    if (heightRatio < 0.35 || widthRatio < 0.25) return 0;

    const directOverlap = iou(previous, box);
    const predictedOverlap = iou(predicted, box);
    const overlap = Math.max(directOverlap, predictedOverlap);

    const distance = Math.hypot(
      predicted.x - box.x,
      predicted.y - box.y
    );

    const bodyHeight = Math.max(previous.height, box.height);

    // Movement allowance grows with elapsed time, but is capped.
    // Tune against your camera and sampling interval.
    const distanceLimit =
      bodyHeight * 0.6 * Math.min(Math.max(elapsedSeconds, 1), 3);

    if (overlap < this.minIou && distance > distanceLimit) {
      return 0;
    }

    const proximity =
      distanceLimit > 0
        ? Math.max(0, 1 - distance / distanceLimit)
        : 0;

    // Overlap matters most, but predicted movement and similar size
    // also contribute to the match.
    return (
      2 * overlap +
      0.7 * proximity +
      0.15 * heightRatio +
      0.15 * widthRatio
    );
  }

  isEligible(track, frameNumber, seq) {
    if (track.finalized) return false;

    const analyzedFramesSinceLastMatch = seq - track.lastSeq;
    const elapsedSeconds = (frameNumber - track.lastFrame) * this.interval;
    return (
      analyzedFramesSinceLastMatch >= 1 &&
      analyzedFramesSinceLastMatch <= this.maxGap + 1 &&
      elapsedSeconds <= this.maxUnobservedSeconds
    );
  }

  recoverScore(track, box, frameNumber) {
    if (!isValidBox(track.box) || !isValidBox(box)) return 0;

    const elapsedFrames = frameNumber - track.lastFrame;
    if (elapsedFrames <= 0) return 0;

    const previous = track.box;
    const heightRatio =
      Math.min(previous.height, box.height) /
      Math.max(previous.height, box.height);
    const widthRatio =
      Math.min(previous.width, box.width) /
      Math.max(previous.width, box.width);
    if (
      heightRatio < RECOVER_MIN_HEIGHT_RATIO ||
      widthRatio < RECOVER_MIN_WIDTH_RATIO
    ) {
      return 0;
    }

    const predicted = this.predictedBox(track, frameNumber);
    const distance = Math.hypot(predicted.x - box.x, predicted.y - box.y);
    const distanceLimit =
      Math.max(previous.height, box.height) *
      RECOVER_DISTANCE_PER_FRAME *
      Math.min(elapsedFrames, RECOVER_MAX_ELAPSED_FRAMES);
    return distanceLimit > 0 && distance < distanceLimit
      ? 1 - distance / distanceLimit
      : 0;
  }

  assignPairs(pairs, usedTracks, usedPeople, matches) {
    pairs.sort((a, b) => b.score - a.score);

    for (const pair of pairs) {
      if (
        usedTracks.has(pair.trackIndex) ||
        usedPeople.has(pair.personIndex)
      ) {
        continue;
      }

      usedTracks.add(pair.trackIndex);
      usedPeople.add(pair.personIndex);
      matches[pair.personIndex] = this.tracks[pair.trackIndex];
    }
  }

  /**
   * people: normalized people for this successfully analyzed frame.
   * frameNumber: 1-based number in your extracted-frame sequence.
   * seq: count of successfully analyzed frames, including frames
   *      where zero people were detected.
   */
  update(people, frameNumber, seq = frameNumber) {
    if (!Array.isArray(people)) {
      throw new Error("people must be an array.");
    }

    if (
      !Number.isInteger(frameNumber) ||
      frameNumber <= this.lastUpdateFrame
    ) {
      throw new Error("frameNumber must increase on every update.");
    }

    if (!Number.isInteger(seq) || seq <= this.lastUpdateSeq) {
      throw new Error("seq must increase on every successful update.");
    }

    for (const person of people) {
      if (!isValidBox(person?.boundingBox)) {
        throw new Error("A person has an invalid bounding box.");
      }
    }

    this.lastUpdateFrame = frameNumber;
    this.lastUpdateSeq = seq;

    const pairs = [];

    this.tracks.forEach((track, trackIndex) => {
      if (!this.isEligible(track, frameNumber, seq)) return;

      people.forEach((person, personIndex) => {
        const matchScore = this.score(
          track,
          person.boundingBox,
          frameNumber
        );

        if (matchScore > 0) {
          pairs.push({ trackIndex, personIndex, score: matchScore });
        }
      });
    });

    const usedTracks = new Set();
    const usedPeople = new Set();
    const matches = new Array(people.length).fill(null);
    this.assignPairs(pairs, usedTracks, usedPeople, matches);

    // Recover a missed track only when its unmatched detection overlaps a
    // person already matched in this frame, making occlusion plausible.
    const recoveryPairs = [];
    people.forEach((person, personIndex) => {
      if (usedPeople.has(personIndex)) return;

      const overlapsMatchedPerson = people.some(
        (other, otherIndex) =>
          usedPeople.has(otherIndex) &&
          overlapOfSmaller(person.boundingBox, other.boundingBox) >=
            OCCLUSION_OVERLAP
      );
      if (!overlapsMatchedPerson) return;

      this.tracks.forEach((track, trackIndex) => {
        if (
          usedTracks.has(trackIndex) ||
          !this.isEligible(track, frameNumber, seq) ||
          seq - track.lastSeq > RECOVER_MAX_FRAME_DELTA
        ) {
          return;
        }

        const matchScore = this.recoverScore(
          track,
          person.boundingBox,
          frameNumber
        );
        if (matchScore > 0) {
          recoveryPairs.push({ trackIndex, personIndex, score: matchScore });
        }
      });
    });
    this.assignPairs(recoveryPairs, usedTracks, usedPeople, matches);

    return people.map((person, personIndex) => {
      let track = matches[personIndex];

      if (!track) {
        track = {
          id: this.nextId++,
          box: { ...person.boundingBox },
          velocityX: 0,
          velocityY: 0,
          seenCount: 0,
          hasShownId: false,
          firstVisibleFrame: null,
          firstFrame: frameNumber,
          visibleFrames: 0,
          noIdFrames: 0,
          unknownFrames: 0,
          missingStreak: 0,
          missingStartFrame: null,
          removalEvent: null,
          removalPeriods: [],
          activeRemovalPeriod: null,
          alerted: false,
          lastFrame: frameNumber,
          lastSeq: seq,
        };

        this.tracks.push(track);
      } else {
        const elapsedFrames = frameNumber - track.lastFrame;

        // A sampled frame without this person breaks the consecutive
        // missing-ID streak, including frames whose Workflow call failed.
        if (frameNumber - track.lastFrame > 1) {
          track.missingStreak = 0;
          track.missingStartFrame = null;
        }

        if (elapsedFrames > 0) {
          const measuredVelocityX =
            (person.boundingBox.x - track.box.x) / elapsedFrames;
          const measuredVelocityY =
            (person.boundingBox.y - track.box.y) / elapsedFrames;

          // Smooth velocity to reduce effects of jittery boxes.
          track.velocityX =
            0.5 * track.velocityX + 0.5 * measuredVelocityX;

          track.velocityY =
            0.5 * track.velocityY + 0.5 * measuredVelocityY;
        }
      }

      track.box = { ...person.boundingBox };
      track.lastFrame = frameNumber;
      track.lastSeq = seq;
      track.seenCount += 1;

      if (person.condition === "visible") {
        track.hasShownId = true;
        track.visibleFrames += 1;
        track.firstVisibleFrame ??= frameNumber;
        track.missingStreak = 0;
        track.missingStartFrame = null;
      } else if (person.condition === "not_visible") {
        track.noIdFrames += 1;
        if (track.missingStreak === 0) {
          track.missingStartFrame = frameNumber;
        }
        track.missingStreak += 1;
      } else {
        track.unknownFrames += 1;
        if (this.unknownResetsStreak) {
          track.missingStreak = 0;
          track.missingStartFrame = null;
        }
      }

      return { person, track };
    });
  }

  getTrackCounts({ minFrames = 2, minVisibleFrames = 1 } = {}) {
    const counts = { total: 0, idVisible: 0, idNotVisible: 0, unknown: 0 };

    for (const track of this.tracks) {
      if (track.seenCount < minFrames) continue;
      counts.total += 1;

      if (track.visibleFrames >= minVisibleFrames) counts.idVisible += 1;
      else if (track.alerted) counts.idNotVisible += 1;
      else counts.unknown += 1;
    }

    return counts;
  }
}

export { PersonTracker, stateForTrackFrame, verdictFor };
