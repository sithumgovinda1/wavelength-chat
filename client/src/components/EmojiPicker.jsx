import { EMOJI_PALETTE } from "../emojis.js";

export default function EmojiPicker({ onPick, onClose }) {
  return (
    <div className="emoji-picker">
      <div className="emoji-picker-header">
        <span>Emoji</span>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="emoji-grid">
        {EMOJI_PALETTE.map((e) => (
          <button
            key={e}
            className="emoji-cell"
            onClick={() => {
              onPick(e);
            }}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
