import config from '../config/env.js';

function isInside(person, card) {
  if (!person.hasBoundingBox || !card.hasBoundingBox) return false;
  const left = person.x - person.width / 2;
  const right = person.x + person.width / 2;
  const top = person.y - person.height / 2;
  const bottom = top + person.height * 0.6;
  return card.x >= left && card.x <= right && card.y >= top && card.y <= bottom;
}

export function classifyDetections(predictions) {
  const accepted = predictions.filter((prediction) => (
    prediction.confidence >= config.confidenceThreshold
  ));
  const people = accepted.filter((prediction) => ['person', 'people'].includes(prediction.class));
  const cards = accepted.filter((prediction) => (
    ['id_card', 'id card', 'id-card', 'idcard', 'icard'].includes(prediction.class)
  ));
  const personStatuses = new Map(people.map((person) => {
    const hasId = cards.some((card) => isInside(person, card));
    const idStatus = hasId
      ? 'present'
      : !person.hasBoundingBox || cards.length > 0
        ? 'uncertain'
        : 'missing';
    return [person, { hasId, idStatus }];
  }));

  return {
    people: people.map((person) => ({ ...person, ...personStatuses.get(person) })),
    cards,
    annotatedPredictions: predictions.map((prediction) => ({
      ...prediction,
      ...(personStatuses.get(prediction) ?? {}),
    })),
  };
}
