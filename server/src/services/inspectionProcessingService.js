import fs from "fs/promises";
import path from "path";
import cloudinary from "../config/cloudinary.js";
import Inspection from "../models/Inspection.js";
import DetectionEvent from "../models/DetectionEvent.js";
import { getIO } from "../sockets/socket.js";
import { extractFrames } from "./videoProcessingService.js";
import { runRoboflowWorkflow } from "./roboflowService.js";
import { normalizeRoboflowResult } from "./roboflowResultService.js";
import {
  PersonTracker,
  stateForTrackFrame,
  verdictFor,
} from "./trackingService.js";
import { createAnnotatedFrame, renderPreviewVideo } from "./previewService.js";
import {
  addCompanyMatchOnce,
  getCompanyMatchForPerson,
} from "./companyMatchService.js";

const INTERVAL = 1;
const CONCURRENCY = 3;
const MAX_GAP = 3;
const REMOVAL_CONFIRM_FRAMES = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const summarizeWorkflowResponse = (response) => {
  const sourceFrames = Array.isArray(response?.frames)
    ? response.frames
    : Array.isArray(response)
      ? response
      : [response];
  const items = sourceFrames.flatMap((item) => {
    const outputs = item?.outputs;
    if (Array.isArray(outputs)) return outputs;
    if (outputs && typeof outputs === "object") return [outputs];
    return [item];
  });
  const flatten = (value) =>
    Array.isArray(value) ? value.flatMap(flatten) : value == null ? [] : [value];

  return {
    responseType: Array.isArray(response)
      ? "array"
      : Array.isArray(response?.frames)
        ? "video-frames"
        : typeof response,
    outputCount: items.length,
    outputs: items.slice(0, 3).map((output) => {
      const people = output?.person_predictions?.predictions;
      const statuses = output?.person_status;
      const badges = output?.badge_predictions?.predictions;
      const lanyardColors = flatten(output?.lanyard_color_assessment);
      const lanyardVisuals = flatten(output?.lanyard_visual_assessments);
      const companySignals = flatten(output?.person_company_signals);
      const statusCounts = {};

      if (Array.isArray(statuses)) {
        for (const entry of statuses) {
          const status = typeof entry?.status === "string" ? entry.status : "missing";
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        }
      }

      const sample = (predictions) =>
        Array.isArray(predictions)
          ? predictions.slice(0, 3).map((prediction) => ({
              class: prediction?.class,
              confidence: prediction?.confidence,
              x: prediction?.x,
              y: prediction?.y,
              width: prediction?.width,
              height: prediction?.height,
            }))
          : null;

      return {
        keys: output && typeof output === "object" ? Object.keys(output) : [],
        personImage: output?.person_predictions?.image ?? null,
        peopleCount: Array.isArray(people) ? people.length : null,
        personStatusCounts: statusCounts,
        peopleSample: sample(people),
        badgeImage: output?.badge_predictions?.image ?? null,
        badgesCount: Array.isArray(badges) ? badges.length : null,
        badgesSample: sample(badges),
        lanyardColorCount: lanyardColors.filter(
          (entry) => entry && typeof entry === "object"
        ).length,
        lanyardVisualCount: lanyardVisuals.filter(
          (entry) => entry && typeof entry === "object"
        ).length,
        navyLanyardCandidate: output?.navy_lanyard_candidate ?? null,
        personCompanySignals: companySignals
          .filter((entry) => entry && typeof entry === "object")
          .slice(0, 3)
          .map(({ person_index, company_signal, company_text_status }) => ({
            person_index,
            company_signal,
            company_text_status,
          })),
      };
    }),
  };
};

const analyzeFrame = async (framePath) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await runRoboflowWorkflow(framePath);
    } catch (error) {
      if (attempt === 3) {
        console.error(`Roboflow analysis failed after ${attempt} attempts:`, error.message);
        return null;
      }
      await sleep(1500 * attempt);
    }
  }

  return null;
};

const saveEvidence = async ({
  inspectionId,
  track,
  entries,
  evidence = track.evidence,
  lastIdVisibleEvidence = null,
  reason = "no_badge_on_entry",
  confirmed = true,
  note,
}) => {
  const folder = `id-detection/evidence/${inspectionId}`;

  const original = await cloudinary.uploader.upload(evidence.framePath, { folder });
  const annotatedBuffer = await createAnnotatedFrame({
    framePath: evidence.framePath,
    entries,
    badges: evidence.badges,
    lanyardColorAssessments: evidence.lanyardColorAssessments,
    companyTextAssessments: evidence.companyTextAssessments,
    width: evidence.frameWidth,
    height: evidence.frameHeight,
    counts: countsOf(entries),
  });
  const annotated = await cloudinary.uploader.upload(
    `data:image/jpeg;base64,${annotatedBuffer.toString("base64")}`,
    { folder }
  );
  let lastIdVisibleImage = null;
  if (lastIdVisibleEvidence) {
    try {
      const lastVisibleBuffer = await createAnnotatedFrame({
        framePath: lastIdVisibleEvidence.framePath,
        entries: lastIdVisibleEvidence.entries,
        badges: lastIdVisibleEvidence.badges,
        lanyardColorAssessments:
          lastIdVisibleEvidence.lanyardColorAssessments,
        companyTextAssessments:
          lastIdVisibleEvidence.companyTextAssessments,
        width: lastIdVisibleEvidence.frameWidth,
        height: lastIdVisibleEvidence.frameHeight,
        counts: lastIdVisibleEvidence.counts,
      });
      const uploadedLastVisible = await cloudinary.uploader.upload(
        `data:image/jpeg;base64,${lastVisibleBuffer.toString("base64")}`,
        { folder }
      );
      lastIdVisibleImage = {
        url: uploadedLastVisible.secure_url,
        publicId: uploadedLastVisible.public_id,
      };
    } catch (error) {
      console.error(
        `Could not save last ID-visible frame for track ${track.id}:`,
        error.message
      );
    }
  }
  const summary =
    `Judged over ${track.seenCount} frame(s): ID visible in ${track.visibleFrames}, ` +
    `not visible in ${track.noIdFrames}, unknown in ${track.unknownFrames}.`;

  return DetectionEvent.create({
    inspection: inspectionId,
    personTrackId: track.id,
    timestamp: evidence.timestamp,
    frameNumber: evidence.frameNumber,
    status: "not_visible",
    reason,
    confirmed,
    resolved: false,
    confidence: evidence.person.confidence,
    note: note || `${evidence.person.note} ${summary}`,
    originalImage: { url: original.secure_url, publicId: original.public_id },
    annotatedImage: { url: annotated.secure_url, publicId: annotated.public_id },
    lastIdVisibleImage,
    lastIdVisibleFrameNumber: lastIdVisibleEvidence?.frameNumber ?? null,
    lastIdVisibleTimestamp: lastIdVisibleEvidence?.timestamp ?? null,
    boundingBox: evidence.person.boundingBox,
    frameWidth: evidence.frameWidth,
    frameHeight: evidence.frameHeight,
  });
};

const interimState = (person) =>
  person.condition === "visible"
    ? "visible"
    : person.condition === "not_visible"
      ? "suspected"
      : "uncertain";

const countsOf = (entries) => ({
  totalPeople: entries.length,
  idVisible: entries.filter((entry) => entry.state === "visible").length,
  idNotVisible: entries.filter(
    (entry) => entry.state === "missing" || entry.state === "suspected"
  ).length,
  unknown: entries.filter((entry) => entry.state === "uncertain").length,
});

const processInspection = async (inspectionId) => {
  const room = `inspection:${inspectionId}`;
  const emit = (event, data) => {
    try {
      getIO().to(room).emit(event, data);
    } catch {
      // Socket.IO may not be initialized in non-server contexts.
    }
  };
  const framesDir = path.resolve("uploads", "frames", String(inspectionId));

  try {
    const inspection = await Inspection.findById(inspectionId);
    if (!inspection) throw new Error("Inspection not found.");

    console.log(`Processing inspection ${inspectionId}.`);
    const tracker = new PersonTracker({
      maxGap: MAX_GAP,
      interval: INTERVAL,
      maxUnobservedSeconds: INTERVAL * (MAX_GAP + 1.5),
    });
    const framePaths = await extractFrames(inspection.video.url, inspection._id, INTERVAL);
    const totalFrames = framePaths.length;
    console.log(`Inspection ${inspectionId}: extracted ${totalFrames} frame(s).`);
    if (totalFrames === 0) {
      throw new Error("No frames could be extracted from the uploaded video.");
    }

    await Inspection.updateOne(
      { _id: inspectionId },
      { totalFrames, duration: totalFrames * INTERVAL, processedFrames: 0 }
    );
    emit("processing-progress", { processedFrames: 0, totalFrames, percentage: 0 });

    const timeline = new Map();
    let frameSize = null;
    let failedFrames = 0;
    let evidenceFailures = 0;
    let companyMatchEvidenceFailures = 0;
    let analyzedCount = 0;
    let peakFrameCounts = null;
    let peakFrameNumber = null;
    const companyMatchesByTrack = new Map();

    const finalizeTrack = async (track) => {
      if (track.finalized) return;
      track.finalized = true;
      track.verdict = verdictFor(track);
      if (track.verdict !== "no_id" || !track.evidence) return;

      try {
        const entries = (
          timeline.get(track.evidence.frameNumber)?.detections || []
        ).map((detection) => ({
            ...detection,
            state: detection.trackId === track.id ? "missing" : detection.state,
          }));
        const event = await saveEvidence({ inspectionId, track, entries });
        track.alerted = true;

        const payload = {
          eventId: String(event._id),
          personTrackId: track.id,
          timestamp: event.timestamp,
          frameNumber: event.frameNumber,
          reason: event.reason,
          confirmed: true,
          resolved: false,
          originalImageUrl: event.originalImage.url,
          annotatedImageUrl: event.annotatedImage.url,
        };
        emit("id-evidence", payload);
        emit("id-alert", payload);
      } catch (error) {
        evidenceFailures++;
        console.error(`Could not save evidence for track ${track.id}:`, error.message);
      }
    };

    const createRemovalEvent = async ({
      person,
      track,
      frame,
      framePath,
      frameNumber,
      entries,
    }) => {
      if (
        !track.hasShownId ||
        track.missingStreak < REMOVAL_CONFIRM_FRAMES
      ) {
        return;
      }

      if (!track.activeRemovalPeriod) {
        const period = {
          startFrame: track.missingStartFrame ?? frameNumber,
          endFrame: null,
        };
        track.removalPeriods.push(period);
        track.activeRemovalPeriod = period;
        track.removalEvidenceAttempts = 0;
      }
      if (track.removalEvent) return;
      if ((track.removalEvidenceAttempts ?? 0) >= 2) {
        return;
      }
      track.removalEvidenceAttempts = (track.removalEvidenceAttempts ?? 0) + 1;

      const evidence = {
        person,
        framePath,
        frameNumber,
        timestamp: frame.timestamp,
        frameWidth: person.frameWidth ?? frame.frameWidth,
        frameHeight: person.frameHeight ?? frame.frameHeight,
        badges: frame.badges,
        lanyardColorAssessments: frame.lanyardColorAssessments,
        companyTextAssessments: frame.companyTextAssessments,
      };

      try {
        const event = await saveEvidence({
          inspectionId,
          track,
          entries: entries.map((entry) => ({
            ...entry,
            state: entry.trackId === track.id ? "missing" : entry.state,
          })),
          evidence,
          lastIdVisibleEvidence: track.lastIdVisibleEvidence,
          reason: "possible_badge_removal",
          confirmed: false,
          note:
            `ID was visible earlier, then was not visible in ${REMOVAL_CONFIRM_FRAMES} consecutive sampled frames.`,
        });
        track.removalEvent = event;
        console.log(
          `Track #${track.id}: possible badge removal at frame ${frameNumber} ` +
            `after ${track.missingStreak} consecutive no-ID samples.`
        );

        emit("id-evidence", {
          eventId: String(event._id),
          personTrackId: track.id,
          timestamp: event.timestamp,
          frameNumber: event.frameNumber,
          reason: event.reason,
          confirmed: false,
          resolved: false,
          originalImageUrl: event.originalImage.url,
          annotatedImageUrl: event.annotatedImage.url,
        });
      } catch (error) {
        evidenceFailures++;
        console.error(
          `Could not save badge-removal evidence for track ${track.id}:`,
          error.message
        );
      }
    };

    const resolveRemovalEvent = async (track, frameNumber) => {
      if (track.activeRemovalPeriod) {
        track.activeRemovalPeriod.endFrame = frameNumber - 1;
        track.activeRemovalPeriod = null;
      }
      if (!track.removalEvent) return;

      try {
        const event = await DetectionEvent.findByIdAndUpdate(
          track.removalEvent._id,
          { $set: { resolved: true, resolvedAt: new Date() } },
          { returnDocument: "after" }
        );
        if (!event) {
          throw new Error(`Evidence event ${track.removalEvent._id} was not found.`);
        }

        const eventId = String(event._id);
        track.removalEvent = null;
        console.log(
          `Track #${track.id}: badge-removal suspicion resolved at frame ${frameNumber}.`
        );
        emit("id-evidence-resolved", {
          eventId,
          personTrackId: track.id,
          reason: "badge_visible_again",
        });
      } catch (error) {
        evidenceFailures++;
        console.error(
          `Could not resolve badge-removal evidence for track ${track.id}:`,
          error.message
        );
      }
    };

    for (let start = 0; start < totalFrames; start += CONCURRENCY) {
      const batch = framePaths.slice(start, start + CONCURRENCY);
      const responses = await Promise.all(batch.map(analyzeFrame));

      for (let i = 0; i < batch.length; i++) {
        const frameNumber = start + i + 1;
        if (!responses[i]) {
          failedFrames++;
          console.warn(`Frame ${frameNumber} could not be analyzed.`);
          continue;
        }

        if (process.env.DEBUG_WORKFLOW === "true") {
          console.log(
            `Roboflow response for inspection ${inspectionId}, frame ${frameNumber}:`,
            JSON.stringify(summarizeWorkflowResponse(responses[i]))
          );
        }

        let frame;
        try {
          frame = normalizeRoboflowResult(responses[i], frameNumber, INTERVAL);
        } catch (error) {
          console.error(`Frame ${frameNumber} parse error:`, error.message);
          failedFrames++;
          continue;
        }

        console.log(
          `Inspection ${inspectionId}, frame ${frameNumber}/${totalFrames}: ` +
          `${frame.counts.totalPeople} people ` +
          `(${frame.counts.idVisible} ID visible, ${frame.counts.idNotVisible} no ID, ` +
          `${frame.counts.unknown} unknown).`
        );

        if (
          !peakFrameCounts ||
          frame.counts.totalPeople > peakFrameCounts.totalPeople
        ) {
          peakFrameCounts = frame.counts;
          peakFrameNumber = frameNumber;
        }

        const frameWidth = frame.frameWidth ?? frame.people[0]?.frameWidth;
        const frameHeight = frame.frameHeight ?? frame.people[0]?.frameHeight;
        if (!frameSize && frameWidth && frameHeight) {
          frameSize = { width: frameWidth, height: frameHeight };
        }

        analyzedCount++;
        const tracked = tracker.update(frame.people, frameNumber, analyzedCount);
        for (const { person, track } of tracked) {
          const match = getCompanyMatchForPerson(person, frame);
          if (!match) continue;

          addCompanyMatchOnce(companyMatchesByTrack, {
            personTrackId: track.id,
            frameNumber,
            timestamp: frame.timestamp,
            framePath: batch[i],
            frameWidth: frame.frameWidth,
            frameHeight: frame.frameHeight,
            detection: {
              trackId: track.id,
              state: interimState(person),
              box: person.boundingBox,
              companySignal: person.companySignal,
              companyClueLabel: person.companyClueLabel,
            },
            ...match,
          });
        }

        if (tracked.length) {
          console.log(
            `Track statuses for frame ${frameNumber}: ` +
              tracked
                .map(
                  ({ person, track }) =>
                    `#${track.id} ${person.condition} ` +
                    `(visible before: ${track.hasShownId}, no-ID streak: ${track.missingStreak})`
                )
                .join("; ")
          );
        }
        for (const { person, track } of tracked) {
          if (person.condition !== "not_visible") continue;
          const box = person.boundingBox;
          const score =
            Math.max(0, box.width) *
            Math.max(0, box.height) *
            (Number.isFinite(person.confidence) ? person.confidence : 0.5);
          if (!track.evidence || score > track.evidence.score) {
            track.evidence = {
              score,
              person,
              framePath: batch[i],
              frameNumber,
              timestamp: frame.timestamp,
              frameWidth: person.frameWidth ?? frame.frameWidth,
              frameHeight: person.frameHeight ?? frame.frameHeight,
              badges: frame.badges,
              lanyardColorAssessments: frame.lanyardColorAssessments,
              companyTextAssessments: frame.companyTextAssessments,
            };
          }
        }

        const overlayEntries = tracked.map(({ person, track }) => ({
          trackId: track.id,
          state: interimState(person),
          box: person.boundingBox,
          companySignal: person.companySignal,
          companyClueLabel: person.companyClueLabel,
        }));

        timeline.set(frameNumber, {
          detections: overlayEntries,
          badges: frame.badges,
          lanyardColorAssessments: frame.lanyardColorAssessments,
          companyTextAssessments: frame.companyTextAssessments,
          lanyardVisualAssessments: frame.lanyardVisualAssessments,
          counts: frame.counts,
        });

        for (const { person, track } of tracked) {
          if (person.condition !== "visible") continue;
          track.lastIdVisibleEvidence = {
            framePath: batch[i],
            frameNumber,
            timestamp: frame.timestamp,
            frameWidth: person.frameWidth ?? frame.frameWidth,
            frameHeight: person.frameHeight ?? frame.frameHeight,
            entries: overlayEntries,
            badges: frame.badges,
            lanyardColorAssessments: frame.lanyardColorAssessments,
            companyTextAssessments: frame.companyTextAssessments,
            counts: frame.counts,
          };
        }

        for (const { person, track } of tracked) {
          if (person.condition === "visible") {
            await resolveRemovalEvent(track, frameNumber);
          } else if (person.condition === "not_visible") {
            await createRemovalEvent({
              person,
              track,
              frame,
              framePath: batch[i],
              frameNumber,
              entries: overlayEntries,
            });
          }
        }

        for (const track of tracker.tracks) {
          if (!track.finalized && analyzedCount - track.lastSeq > MAX_GAP) {
            await finalizeTrack(track);
          }
        }
      }

      const processedFrames = Math.min(start + batch.length, totalFrames);
      await Inspection.updateOne({ _id: inspectionId }, { processedFrames });
      emit("processing-progress", {
        processedFrames,
        totalFrames,
        percentage: Math.round((processedFrames / totalFrames) * 100),
      });
    }

    for (const track of tracker.tracks) {
      await finalizeTrack(track);
    }

    console.log(`Track verdicts for inspection ${inspectionId}:`);
    console.table(
      tracker.tracks.map((track) => ({
        id: track.id,
        first: track.firstFrame,
        last: track.lastFrame,
        seen: track.seenCount,
        idFrames: track.visibleFrames,
        noId: track.noIdFrames,
        unknown: track.unknownFrames,
        missingStreak: track.missingStreak,
        hadVisibleId: track.hasShownId,
        verdict: track.verdict,
      }))
    );

    const verdictCounts = {
      id_worn: 0,
      no_id: 0,
      possible_removal: 0,
      unverified: 0,
    };
    for (const track of tracker.tracks) {
      if (track.verdict in verdictCounts) verdictCounts[track.verdict]++;
    }

    for (const [frameNumber, frameData] of timeline) {
      const detections = frameData.detections.flatMap((detection) => {
        const track = tracker.tracks.find(
          (candidate) => candidate.id === detection.trackId
        );
        if (
          !track ||
          (track.verdict === "ignored" &&
            !companyMatchesByTrack.has(track.id))
        ) {
          return [];
        }
        return [
          {
            ...detection,
            state: stateForTrackFrame(track, detection, frameNumber),
          },
        ];
      });
      timeline.set(frameNumber, {
        ...frameData,
        detections,
        counts: countsOf(detections),
      });
    }

    const companyMatches = [];
    for (const match of companyMatchesByTrack.values()) {
      let evidenceImage = null;
      try {
        const frameData = timeline.get(match.frameNumber);
        if (!frameData) {
          throw new Error(`Matching frame ${match.frameNumber} is missing from the preview timeline.`);
        }
        const annotatedBuffer = await createAnnotatedFrame({
          framePath: match.framePath,
          entries: frameData.detections,
          badges: frameData.badges,
          lanyardColorAssessments: frameData.lanyardColorAssessments,
          companyTextAssessments: frameData.companyTextAssessments,
          width: match.frameWidth,
          height: match.frameHeight,
          counts: frameData.counts,
        });
        const uploaded = await cloudinary.uploader.upload(
          `data:image/jpeg;base64,${annotatedBuffer.toString("base64")}`,
          { folder: `id-detection/company-matches/${inspectionId}` }
        );
        evidenceImage = {
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
        };
      } catch (error) {
        companyMatchEvidenceFailures++;
        console.error(
          `Could not save company-match frame for track ${match.personTrackId}:`,
          error.message
        );
      }

      companyMatches.push({
        personTrackId: match.personTrackId,
        frameNumber: match.frameNumber,
        timestamp: match.timestamp,
        lanyardColorStatus: match.lanyardColorStatus,
        companyTextStatus: match.companyTextStatus,
        companyText: match.companyText,
        evidenceImage,
      });
    }

    if (!frameSize) {
      console.warn("Preview skipped: no frame was analyzed successfully.");
    }

    let previewVideo = null;
    if (frameSize && totalFrames > 0) {
      let previewPath = null;
      try {
        previewPath = await renderPreviewVideo({
          videoUrl: inspection.video.url,
          inspectionId,
          timeline,
          totalFrames,
          width: frameSize.width,
          height: frameSize.height,
          interval: INTERVAL,
        });
        const uploaded = await cloudinary.uploader.upload(previewPath, {
          resource_type: "video",
          folder: "id-detection/previews",
        });
        previewVideo = { url: uploaded.secure_url, publicId: uploaded.public_id };
      } catch (error) {
        console.error("Preview video failed:", error);
      } finally {
        if (previewPath) await fs.rm(previewPath, { force: true }).catch(() => {});
      }
    }

    const summaryCounts = peakFrameCounts || {
      totalPeople: 0,
      idVisible: 0,
      idNotVisible: 0,
      unknown: 0,
    };

    const notes = [];
    if (failedFrames) notes.push(`${failedFrames} frame(s) could not be analyzed.`);
    if (evidenceFailures) {
      notes.push(`Could not save or update ${evidenceFailures} badge evidence event(s).`);
    }
    if (companyMatchEvidenceFailures) {
      notes.push(
        `Could not save ${companyMatchEvidenceFailures} company-match frame image(s).`
      );
    }
    if (analyzedCount > 0 && !tracker.tracks.length) {
      notes.push("No people were detected in successfully analyzed frames.");
    }
    if (!previewVideo) notes.push("Preview video could not be generated.");

    const summary = {
      status: "completed",
      totalPeople: summaryCounts.totalPeople,
      peopleWithId: verdictCounts.id_worn,
      peopleWithoutId: verdictCounts.no_id,
      possibleBadgeRemovals: verdictCounts.possible_removal,
      uncertainPeople: verdictCounts.unverified,
      companyMatchCount: companyMatches.length,
      companyMatches,
      countFrameNumber: peakFrameNumber,
      countTimestamp: peakFrameNumber ? (peakFrameNumber - 1) * INTERVAL : 0,
      errorMessage: notes.length ? notes.join(" ") : null,
      ...(previewVideo ? { previewVideo } : {}),
    };

    await Inspection.updateOne({ _id: inspectionId }, summary);
    emit("processing-complete", {
      inspectionId,
      ...summary,
      previewUrl: previewVideo?.url || null,
    });
  } catch (error) {
    console.error("Inspection processing failed:", error);
    await Inspection.updateOne(
      { _id: inspectionId },
      { status: "failed", errorMessage: error.message }
    ).catch((updateError) =>
      console.error("Could not mark inspection as failed:", updateError.message)
    );
    emit("processing-failed", { inspectionId, message: error.message });
  } finally {
    await fs.rm(framesDir, { recursive: true, force: true }).catch((error) =>
      console.error("Frame cleanup failed:", error.message)
    );
  }
};

export { processInspection };
