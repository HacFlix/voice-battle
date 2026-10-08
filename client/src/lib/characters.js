export const CHARACTERS = ['malePerson', 'femalePerson', 'maleAdventurer', 'femaleAdventurer', 'robot', 'zombie'];

export const pose = (character, name = 'idle') =>
  `/characters/${CHARACTERS[(character ?? 0) % CHARACTERS.length]}/${name}.png`;
