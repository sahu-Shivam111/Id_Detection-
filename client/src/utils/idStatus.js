function normalizeClass(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_\s-]/g, '');
}

export function getIdStatus(person) {
  const status = String(person.idStatus ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['present', 'detected', 'has_id'].includes(status)) return 'present';
  if (['missing', 'none', 'no_id', 'not_present', 'absent'].includes(status)) return 'missing';
  if (['uncertain', 'unknown', 'unmatched'].includes(status)) return 'uncertain';
  if (person.hasId === true) return 'present';
  if (person.hasId === false) return 'missing';
  return 'uncertain';
}

export function annotatePredictionsWithPeople(predictions, people) {
  const usedPeople = new Set();
  return predictions.map((prediction) => {
    if (!['person', 'people'].includes(normalizeClass(prediction.class))) return prediction;

    const hasExplicitStatus = ['present', 'detected', 'has_id', 'missing', 'none', 'no_id',
      'not_present', 'absent', 'uncertain', 'unknown', 'unmatched']
      .includes(String(prediction.idStatus ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_'));

    let bestIndex = -1;
    let bestDistance = Infinity;
    people.forEach((person, index) => {
      if (usedPeople.has(index)) return;
      const distance = Math.hypot(
        Number(person.x) - Number(prediction.x),
        Number(person.y) - Number(prediction.y),
      );
      if (Number.isFinite(distance) && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    if (bestIndex !== -1) usedPeople.add(bestIndex);
    if (hasExplicitStatus || typeof prediction.hasId === 'boolean') {
      return { ...prediction, idStatus: getIdStatus(prediction) };
    }
    if (bestIndex === -1) return { ...prediction, idStatus: getIdStatus(prediction) };
    const person = people[bestIndex];
    return { ...prediction, ...person, idStatus: getIdStatus(person) };
  });
}
