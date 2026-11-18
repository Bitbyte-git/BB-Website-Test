import { Suspense, lazy, useCallback, useRef, useState } from 'react'
import BotAvatar from './BotAvatar'
import config from './chatbotConfig.json'
import './ChatBot.css'

const ChatWindow = lazy(() => import('./ChatWindow'))
const rootPath = '/'
const DEV_CHAT_PROXY_PATH = '/__chat-proxy'

function makeMessage(sender, text, extras = {}) {
  return {
    id: `${sender}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sender,
    text,
    ...extras,
  }
}

function waitForElement(id, attempts = 20) {
  return new Promise((resolve) => {
    const existing = document.getElementById(id)
    if (existing) {
      resolve(existing)
      return
    }

    let count = 0
    const interval = window.setInterval(() => {
      const element = document.getElementById(id)
      count += 1

      if (element || count >= attempts) {
        window.clearInterval(interval)
        resolve(element)
      }
    }, 120)
  })
}

function getChatApiUrl() {
  const apiUrl = (
    import.meta.env.VITE_OPENROUTER_API_URL ||
    import.meta.env.VITE_CHAT_API_URL ||
    '/api/chat'
  ).trim()

  if (import.meta.env.DEV && /^https?:\/\//i.test(apiUrl)) {
    return DEV_CHAT_PROXY_PATH
  }

  return apiUrl
}

async function getAiReply(message, history = []) {
  const response = await fetch(getChatApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      history: history.slice(-6).map((m) => ({
        role: m.sender === 'bot' ? 'assistant' : 'user',
        content: m.text,
      })),
    }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || 'Unable to reach BitByte AI')
  }

  return {
    reply: data.reply || config.fallbackMessage,
    sources: Array.isArray(data.sources) ? data.sources : [],
  }
}

async function scrollToSection(target) {
  if (!target) return

  const targetId = target.replace('#', '')
  const isRootPage = window.location.pathname.replace(/\/$/, '') === ''

  if (!isRootPage && ['services', 'showcase', 'pricing', 'contact', 'contact-form'].includes(targetId)) {
    window.location.href = `${rootPath}#${targetId}`
    return
  }

  const element = await waitForElement(targetId)
  if (!element) return

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  element.scrollIntoView({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'start',
  })

  if (window.history?.replaceState) {
    window.history.replaceState(null, '', `#${targetId}`)
  }
}

export default function ChatBot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(() => [
    makeMessage('bot', config.welcomeMessage),
  ])
  const [typing, setTyping] = useState(false)
  const replyTimeoutRef = useRef(0)

  const handleSubmitQuestion = useCallback(async (question) => {
    window.clearTimeout(replyTimeoutRef.current)
    const userMsg = makeMessage('user', question)

    setMessages((current) => [...current, userMsg])
    setTyping(true)

    try {
      const result = await getAiReply(question, [...messages, userMsg])
      setMessages((current) => [
        ...current,
        makeMessage('bot', result.reply, {
          sources: result.sources,
        }),
      ])
    } catch {
      setMessages((current) => [
        ...current,
        makeMessage(
          'bot',
          'I am currently experiencing a connection delay. You can connect directly with our engineering team via WhatsApp at +91 99437 43136 or reachus@bitbytetech.org.',
          {
            phone: '+91 99437 43136 (WhatsApp)',
            email: 'reachus@bitbytetech.org',
            cta: { label: 'Contact Team', target: 'contact' },
          }
        ),
      ])
    } finally {
      setTyping(false)
    }
  }, [messages])

  const handleOpen = () => setOpen(true)
  const handleClose = () => setOpen(false)

  return (
    <div className="bb-chatbot">
      {open ? (
        <Suspense fallback={null}>
          <ChatWindow
            messages={messages}
            onActionClick={scrollToSection}
            onClose={handleClose}
            onMinimize={handleClose}
            onSubmitQuestion={handleSubmitQuestion}
            typing={typing}
          />
        </Suspense>
      ) : (
        <button
          className="bb-chat-launcher"
          type="button"
          aria-label="Open BitByte AI"
          onClick={handleOpen}
        >
          <BotAvatar size="large" />
          <span className="bb-chat-online" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
