import { useEffect, useRef, useState } from 'react'
import ChatHeader from './ChatHeader'
import MessageBubble from './MessageBubble'

export default function ChatWindow({
  messages,
  onActionClick,
  onClose,
  onMinimize,
  onSubmitQuestion,
  typing,
}) {
  const [question, setQuestion] = useState('')
  const scrollRef = useRef(null)
  const messageRefs = useRef({})

  // Find the last question asked by the user
  const lastUserMessage = [...messages].reverse().find((m) => m.sender === 'user')

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    // If there is no user question yet (e.g. initial welcome message), stay at top
    if (!lastUserMessage) {
      container.scrollTop = 0
      return
    }

    // Scroll so the user's latest question and the start of the response are visible at the top
    const timer = setTimeout(() => {
      const targetElement = messageRefs.current[lastUserMessage.id]
      if (targetElement) {
        const containerRect = container.getBoundingClientRect()
        const targetRect = targetElement.getBoundingClientRect()
        const targetTop = targetRect.top - containerRect.top + container.scrollTop

        container.scrollTo({
          top: Math.max(0, targetTop - 12),
          behavior: 'smooth',
        })
      }
    }, 40)

    return () => clearTimeout(timer)
  }, [messages, typing, lastUserMessage])

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return
    onSubmitQuestion(trimmed)
    setQuestion('')
  }

  return (
    <section className="bb-chat-window" aria-label="BitByte AI">
      <ChatHeader onClose={onClose} onMinimize={onMinimize} />
      <div className="bb-chat-log" ref={scrollRef} aria-live="polite">
        {messages.map((message) => (
          <div
            key={message.id}
            id={`msg-${message.id}`}
            ref={(el) => {
              if (el) {
                messageRefs.current[message.id] = el
              } else {
                delete messageRefs.current[message.id]
              }
            }}
          >
            <MessageBubble message={message} onAction={onActionClick} />
          </div>
        ))}
        {typing && (
          <div className="bb-chat-message is-bot">
            <div className="bb-typing" aria-label="BitByte AI is typing">
              <strong>BitByte AI is typing...</strong>
              <i aria-hidden="true" />
              <i aria-hidden="true" />
              <i aria-hidden="true" />
            </div>
          </div>
        )}
      </div>
      <form className="bb-chat-input" onSubmit={handleSubmit}>
        <input
          aria-label="Ask BitByte AI"
          autoComplete="off"
          disabled={typing}
          placeholder="Ask BitByte AI about our services, tech stacks, projects..."
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" disabled={typing}>
          Send
        </button>
      </form>
    </section>
  )
}
