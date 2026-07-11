import { useEffect, useRef, useState } from "react";
import EmojiPicker from "./EmojiPicker.jsx";

export default function MessageInput({
  onSend,
  onTyping,
  replyingTo,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  onEditSubmit,
  onUpload,
}) {
  const [value, setValue] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const typingTimeout = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (editingMessage) setValue(editingMessage.body);
  }, [editingMessage]);

  function handleChange(e) {
    setValue(e.target.value);
    onTyping(true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTyping(false), 1200);
  }

  function submit(e) {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;

    if (editingMessage) {
      onEditSubmit(editingMessage.id, text);
    } else {
      onSend(text);
    }
    setValue("");
    onTyping(false);
    clearTimeout(typingTimeout.current);
  }

  function pickEmoji(emoji) {
    setValue((v) => v + emoji);
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { url, type } = await onUpload(file);
      onSend("", url, type);
    } catch {
      alert("Image upload failed — try a smaller image (max 8MB).");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {replyingTo && !editingMessage && (
        <div className="context-strip">
          <span>
            Replying to <strong>{replyingTo.username}</strong> — {replyingTo.snippet}
          </span>
          <button onClick={onCancelReply}>✕</button>
        </div>
      )}
      {editingMessage && (
        <div className="context-strip editing">
          <span>Editing message</span>
          <button onClick={onCancelEdit}>✕</button>
        </div>
      )}
      {showEmoji && (
        <EmojiPicker onPick={pickEmoji} onClose={() => setShowEmoji(false)} />
      )}

      <form className="composer" onSubmit={submit}>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setShowEmoji((s) => !s)}
          title="Emoji"
        >
          😊
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Send image"
        >
          {uploading ? "…" : "📎"}
        </button>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <input
          placeholder={editingMessage ? "Edit your message…" : "Transmit a message…"}
          value={value}
          onChange={handleChange}
          autoFocus
        />
        <button className="send-btn" disabled={!value.trim()}>
          {editingMessage ? "Save" : "Send"}
        </button>
      </form>
    </div>
  );
}
