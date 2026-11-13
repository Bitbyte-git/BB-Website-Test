import BotAvatar from './BotAvatar'

export default function ChatHeader({ onClose, onMinimize }) {
  return (
    <div className="bb-chat-header">
      <div className="bb-chat-title-wrap">
        <BotAvatar size="small" />
        <div>
          <h2>BitByte AI</h2>
          <div className="bb-chat-status">
            <span aria-hidden="true" />
            <strong>Online</strong>
          </div>
          <p>Official AI Technology Consultant</p>
        </div>
      </div>
      <div className="bb-chat-window-actions">
        <button type="button" aria-label="Minimize BitByte AI" onClick={onMinimize}>
          −
        </button>
        <button type="button" aria-label="Close BitByte AI" onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  )
}
