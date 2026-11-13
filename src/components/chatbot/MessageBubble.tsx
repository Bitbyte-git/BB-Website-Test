import BotAvatar from './BotAvatar'

function formatInlineText(text) {
  if (!text) return text
  // Parse markdown bold: **text** -> <strong>text</strong>
  const boldParts = text.split(/(\*\*[^*]+?\*\*)/g)

  return boldParts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="bb-chat-strong">
          {part.slice(2, -2)}
        </strong>
      )
    }

    // Parse phone numbers like +91 99437 43136 and emails
    const phoneAndEmailRegex = /(\+?91[\s\-]?[6-9]\d{4}[\s\-]?\d{5}|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
    const subParts = part.split(phoneAndEmailRegex)

    return subParts.map((sub, sIdx) => {
      if (!sub) return null

      // Check if it's an email
      if (/@/.test(sub) && /\.[a-zA-Z]{2,}$/.test(sub)) {
        return (
          <a
            key={`${index}-${sIdx}`}
            href={`mailto:${sub}`}
            className="bb-chat-inline-link"
            title={`Email ${sub}`}
          >
            {sub}
          </a>
        )
      }

      // Check if it's a phone number
      const digitsOnly = sub.replace(/\D/g, '')
      if (digitsOnly.length >= 10 && (digitsOnly.endsWith('9943743136') || digitsOnly.length === 10 || digitsOnly.length === 12)) {
        const fullPhone = digitsOnly.length === 10 ? `+91${digitsOnly}` : `+${digitsOnly}`
        return (
          <a
            key={`${index}-${sIdx}`}
            href={`tel:${fullPhone}`}
            className="bb-chat-inline-link bb-chat-inline-tel"
            title={`Tap to call ${sub}`}
          >
            📞 {sub}
          </a>
        )
      }

      return sub
    })
  })
}

function renderFormattedMessage(text) {
  if (!text) return null
  const lines = text.split('\n')

  return (
    <div className="bb-chat-content">
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={idx} className="bb-chat-spacer" />
        }

        const isBullet = trimmed.startsWith('•') || trimmed.startsWith('- ') || trimmed.startsWith('* ')
        const cleanLine = isBullet ? trimmed.replace(/^[•\-\*]\s*/, '') : line

        return (
          <p
            key={idx}
            className={isBullet ? 'bb-chat-bullet' : 'bb-chat-paragraph'}
          >
            {isBullet && <span className="bb-bullet-dot" aria-hidden="true">•</span>}
            <span className="bb-bullet-text">{formatInlineText(cleanLine)}</span>
          </p>
        )
      })}
    </div>
  )
}

export default function MessageBubble({ message, onAction }) {
  const isBot = message.sender === 'bot'
  const text = message.text || ''

  // Auto-detect if phone, call, or WhatsApp is mentioned in the bot response
  const mentionsPhone = /(\+91|99437\s*43136|phone|call\s*this|call\s*now|call\s*us|\bcall\b)/i.test(text)
  const mentionsWhatsApp = /(whatsapp|\+91\s*99437\s*43136)/i.test(text)

  return (
    <div className={`bb-chat-message ${isBot ? 'is-bot' : 'is-user'}`}>
      {isBot && <BotAvatar size="small" />}
      <div className="bb-chat-bubble">
        {renderFormattedMessage(text)}

        {/* 1-Tap Direct Call & WhatsApp Action Buttons */}
        {isBot && (mentionsPhone || mentionsWhatsApp) && (
          <div className="bb-chat-actions-row">
            <a
              href="tel:+919943743136"
              className="bb-chat-call-action-btn"
              title="Call BitByte Technologies directly from phone"
            >
              <span className="bb-action-btn-icon">📞</span>
              <span>Call +91 99437 43136</span>
            </a>
            <a
              href="https://wa.me/919943743136?text=Hello%20BitByte%20Technologies,%20I%20would%20like%20to%20discuss%20a%20project."
              target="_blank"
              rel="noopener noreferrer"
              className="bb-chat-wa-action-btn"
              title="Chat on WhatsApp"
            >
              <span className="bb-action-btn-icon">💬</span>
              <span>WhatsApp</span>
            </a>
          </div>
        )}

        {message.email && (
          <div className="bb-chat-contact">
            <span>Email:</span>
            <a href={`mailto:${message.email}`} title="Open email">
              {message.email}
            </a>
          </div>
        )}

        {message.phone && !mentionsPhone && (
          <div className="bb-chat-contact">
            <span>{message.phone.toLowerCase().includes('whatsapp') ? 'WhatsApp:' : 'Phone:'}</span>
            {message.phone.toLowerCase().includes('whatsapp') ? (
              <a
                href={`https://wa.me/${message.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Chat on WhatsApp"
              >
                {message.phone}
              </a>
            ) : (
              <a href={`tel:${message.phone.replace(/[^+\d]/g, '')}`} title="Call phone">
                {message.phone}
              </a>
            )}
          </div>
        )}

        {message.cta && (
          <button
            className="bb-chat-cta"
            type="button"
            onClick={() => onAction(message.cta.target)}
          >
            {message.cta.label}
          </button>
        )}
      </div>
    </div>
  )
}
