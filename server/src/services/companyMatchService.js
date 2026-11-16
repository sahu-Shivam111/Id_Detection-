function getCompanyMatchForPerson(person, frame) {
  const signal = person?.companySignal;
  if (
    signal?.company_signal !== "name_and_color_match" ||
    signal.company_text_status !== "company_text_match" ||
    !Array.isArray(signal.lanyard_indices)
  ) {
    return null;
  }

  for (const lanyardIndex of signal.lanyard_indices) {
    if (!Number.isInteger(lanyardIndex)) continue;

    const colorAssessment = frame.lanyardColorAssessments.find(
      (assessment) => assessment.lanyard_index === lanyardIndex
    );
    const textAssessment = frame.companyTextAssessments.find(
      (assessment) =>
        assessment.lanyard_index === lanyardIndex &&
        assessment.status === "company_text_match"
    );

    if (
      !colorAssessment ||
      typeof colorAssessment.status !== "string" ||
      !textAssessment
    ) {
      continue;
    }

    return {
      lanyardColorStatus: colorAssessment.status,
      companyTextStatus: textAssessment.status,
      companyText:
        typeof textAssessment.read_text === "string"
          ? textAssessment.read_text.trim() || null
          : null,
    };
  }

  return null;
}

function addCompanyMatchOnce(matchesByTrack, match) {
  if (matchesByTrack.has(match.personTrackId)) return false;
  matchesByTrack.set(match.personTrackId, match);
  return true;
}

export { addCompanyMatchOnce, getCompanyMatchForPerson };
