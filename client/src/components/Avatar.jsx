import { pose } from '../lib/characters.js';

export default function Avatar({ character, pose: poseName = 'idle', size = 64 }) {
  return <img className="avatar" src={pose(character, poseName)} width={size * 0.75} height={size} alt="" draggable={false} />;
}
