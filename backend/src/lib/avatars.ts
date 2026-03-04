const ANIMAL_AVATARS = [
  "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼",
  "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔",
  "🐧", "🐦", "🦆", "🦉", "🐴", "🦄", "🐝", "🐛",
  "🦋", "🐌", "🐙", "🦀", "🐠", "🐬", "🐳", "🦈",
  "🐊", "🦎", "🐢", "🦜", "🦩", "🐘", "🦒", "🐿️",
];

const usedAvatars = new Set<string>();

export function getRandomAvatar(): string {
  // If all avatars are used, reset
  if (usedAvatars.size >= ANIMAL_AVATARS.length) {
    usedAvatars.clear();
  }

  let avatar: string;
  do {
    avatar = ANIMAL_AVATARS[Math.floor(Math.random() * ANIMAL_AVATARS.length)];
  } while (usedAvatars.has(avatar));

  usedAvatars.add(avatar);
  return avatar;
}

export function resetAvatars(): void {
  usedAvatars.clear();
}

export { ANIMAL_AVATARS };
