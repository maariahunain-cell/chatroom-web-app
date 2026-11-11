import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signInAnonymously } from 'firebase/auth';
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase.js';

const LOCAL_MESSAGES_KEY = 'chatroom-demo-messages-v1';
const SAVED_NAME_KEY = 'chatroom-display-name-v1';
const QUICK_EMOJIS = ['🙂', '😂', '❤️', '🎉', '👋', '🙌'];
const MAX_MESSAGE_LENGTH = 500;

function readLocalMessages() {
  try {
    const saved = localStorage.getItem(LOCAL_MESSAGES_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Today';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function groupMessagesByDay(messages) {
  return messages.reduce((groups, message) => {
    const day = formatDay(message.createdAt);
    const last = groups[groups.length - 1];
    if (!last || last.day !== day) groups.push({ day, messages: [message] });
    else last.messages.push(message);
    return groups;
  }, []);
}

function App() {
  const [displayName, setDisplayName] = useState(() => {
    try {
      return localStorage.getItem(SAVED_NAME_KEY) || '';
    } catch {
      return '';
    }
  });
  const [nameInput, setNameInput] = useState(displayName);
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState(() => (isFirebaseConfigured ? [] : readLocalMessages()));
  const [draft, setDraft] = useState('');
  const [connection, setConnection] = useState(isFirebaseConfigured ? 'connecting' : 'demo');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const feedRef = useRef(null);
  const inputRef = useRef(null);

  const messageCollection = useMemo(() => {
    if (!db) return null;
    return collection(db, 'rooms', 'general', 'messages');
  }, []);

  const joinRoom = useCallback(async (event) => {
    event?.preventDefault();
    const cleanedName = nameInput.trim().replace(/\s+/g, ' ');
    if (cleanedName.length < 2 || cleanedName.length > 24) {
      setError('Choose a name between 2 and 24 characters.');
      return;
    }

    setError('');
    setDisplayName(cleanedName);
    try {
      localStorage.setItem(SAVED_NAME_KEY, cleanedName);
    } catch {
      // The chat can still be used if browser storage is unavailable.
    }

    if (isFirebaseConfigured) {
      setConnection('connecting');
      try {
        const credential = await signInAnonymously(auth);
        setUserId(credential.user.uid);
        setConnection('live');
      } catch (joinError) {
        console.error('Firebase sign-in failed:', joinError);
        setError('Could not connect to the live room. Check your Firebase setup and try again.');
        setConnection('offline');
        return;
      }
    } else {
      setUserId('local-demo-user');
      setConnection('demo');
      setMessages(readLocalMessages());
    }

    setJoined(true);
  }, [nameInput]);

  useEffect(() => {
    if (!joined || !isFirebaseConfigured || !messageCollection || !userId) return undefined;

    const latestMessages = query(messageCollection, orderBy('createdAt', 'desc'), limit(100));
    const unsubscribe = onSnapshot(
      latestMessages,
      (snapshot) => {
        const nextMessages = snapshot.docs
          .map((document) => {
            const data = document.data();
            return {
              id: document.id,
              text: data.text,
              username: data.username,
              uid: data.uid,
              createdAt: data.createdAt?.toDate?.() ?? new Date(),
            };
          })
          .reverse();
        setMessages(nextMessages);
        setConnection('live');
        setError('');
      },
      (snapshotError) => {
        console.error('Firestore listener failed:', snapshotError);
        setConnection('offline');
        setError('The live room could not load. Check that Firestore is enabled and the security rules are published.');
      },
    );

    return unsubscribe;
  }, [joined, messageCollection, userId]);

  useEffect(() => {
    if (!joined || isFirebaseConfigured) return undefined;
    const syncLocalMessages = (event) => {
      if (event.key === LOCAL_MESSAGES_KEY) setMessages(readLocalMessages());
    };
    window.addEventListener('storage', syncLocalMessages);
    return () => window.removeEventListener('storage', syncLocalMessages);
  }, [joined]);

  useEffect(() => {
    if (!joined || !feedRef.current) return;
    feedRef.current.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, joined]);

  const sendMessage = useCallback(async (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      setError(`Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
      return;
    }

    setSending(true);
    setError('');
    try {
      if (isFirebaseConfigured) {
        if (!auth.currentUser) throw new Error('You are not connected to the room. Rejoin and try again.');
        await addDoc(messageCollection, {
          text,
          username: displayName,
          uid: auth.currentUser.uid,
          createdAt: serverTimestamp(),
        });
      } else {
        const localMessage = {
          id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          text,
          username: displayName,
          uid: 'local-demo-user',
          createdAt: new Date().toISOString(),
        };
        setMessages((current) => {
          const next = [...current, localMessage].slice(-100);
          try {
            localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(next));
          } catch {
            // Keep the in-memory message if storage is full or blocked.
          }
          return next;
        });
      }
      setDraft('');
      setEmojiOpen(false);
      inputRef.current?.focus();
    } catch (sendError) {
      console.error('Message send failed:', sendError);
      setError(isFirebaseConfigured
        ? 'Your message could not be sent. Check your connection and Firestore rules.'
        : 'Your message could not be saved in this browser.');
    } finally {
      setSending(false);
    }
  }, [displayName, draft, messageCollection, sending]);

  const addEmoji = (emoji) => {
    setDraft((current) => `${current}${emoji}`);
    setEmojiOpen(false);
    inputRef.current?.focus();
  };

  const leaveRoom = () => {
    setJoined(false);
    setDraft('');
    setError('');
    setEmojiOpen(false);
    setNameInput(displayName);
  };

  const groupedMessages = useMemo(() => groupMessagesByDay(messages), [messages]);
  const statusLabel = connection === 'live' ? 'Live connection' : connection === 'demo' ? 'Local demo' : connection === 'offline' ? 'Connection issue' : 'Connecting';

  if (!joined) {
    return (
      <main className="entry-shell">
        <div className="entry-glow entry-glow-one" />
        <div className="entry-glow entry-glow-two" />
        <header className="brand-lockup entry-brand">
          <div className="brand-mark" aria-hidden="true"><span /></div>
          <span>chatroom</span>
        </header>
        <section className="entry-card">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR SPACE TO CONNECT</div>
          <h1>Good conversations<br /><span>start here.</span></h1>
          <p className="entry-copy">A simple room for quick thoughts, friendly hellos, and shared moments.</p>
          <form className="join-form" onSubmit={joinRoom}>
            <label htmlFor="display-name">Choose your display name</label>
            <input
              id="display-name"
              autoComplete="nickname"
              maxLength={24}
              placeholder="e.g. Alex"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button join-button" type="submit">
              Join the conversation <span aria-hidden="true">→</span>
            </button>
          </form>
          <div className="entry-footnote"><span className="lock-symbol">◈</span> No account needed. Just pick a name and join.</div>
        </section>
        <footer className="entry-footer">MADE FOR GOOD CONVERSATIONS <span>·</span> CHATROOM</footer>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup sidebar-brand">
          <div className="brand-mark" aria-hidden="true"><span /></div>
          <span>chatroom</span>
        </div>
        <div className="sidebar-section-label">YOUR SPACE</div>
        <div className="room-list-item active-room">
          <span className="hash-icon">#</span>
          <span className="room-name">general</span>
          <span className="room-dot" />
        </div>
        <div className="sidebar-note">
          <div className="note-icon">✦</div>
          <p>One room. Many voices. Keep it kind.</p>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-section-label">YOUR PROFILE</div>
          <div className="profile-row">
            <div className="avatar avatar-you">{displayName.slice(0, 1).toUpperCase()}</div>
            <div className="profile-meta"><strong>{displayName}</strong><span>You're here</span></div>
            <button className="icon-button leave-button" onClick={leaveRoom} title="Leave room" aria-label="Leave room">↗</button>
          </div>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div className="header-room-title">
            <div className="room-hash">#</div>
            <div><h2>general</h2><p>A little space for everyone.</p></div>
          </div>
          <div className="header-right">
            <div className={`connection-pill ${connection}`}><span className="connection-dot" />{statusLabel}</div>
            <div className="header-divider" />
            <div className="header-user"><div className="avatar small-avatar">{displayName.slice(0, 1).toUpperCase()}</div><span>{displayName}</span></div>
          </div>
        </header>

        <div className="messages-area" ref={feedRef} aria-live="polite" aria-label="Chat messages">
          <div className="welcome-block">
            <div className="welcome-icon">✦</div>
            <div className="welcome-kicker">WELCOME TO THE ROOM</div>
            <h1>Where the conversation<br /><span>begins.</span></h1>
            <p>This is the start of <strong>#general</strong>. Say hello and make yourself at home.</p>
          </div>

          {groupedMessages.map((group) => (
            <div className="message-group" key={group.day}>
              <div className="day-divider"><span />{group.day}<span /></div>
              {group.messages.map((message) => {
                const mine = message.uid === userId || (!isFirebaseConfigured && message.uid === 'local-demo-user');
                return (
                  <article className={`message-row ${mine ? 'my-message' : ''}`} key={message.id}>
                    <div className={`avatar message-avatar ${mine ? 'avatar-you' : ''}`}>{(message.username || '?').slice(0, 1).toUpperCase()}</div>
                    <div className="message-content">
                      <div className="message-meta"><strong>{message.username || 'Guest'}</strong>{mine && <span className="you-tag">YOU</span>}<time>{formatTime(message.createdAt)}</time></div>
                      <p>{message.text}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </div>

        <div className="composer-wrap">
          {error && <div className="inline-error" role="alert">{error}</div>}
          {emojiOpen && (
            <div className="emoji-popover" aria-label="Choose an emoji">
              {QUICK_EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => addEmoji(emoji)}>{emoji}</button>)}
            </div>
          )}
          <form className="composer" onSubmit={sendMessage}>
            <button className={`emoji-button ${emojiOpen ? 'selected' : ''}`} type="button" onClick={() => setEmojiOpen((open) => !open)} aria-label="Add emoji" title="Add emoji">☺</button>
            <textarea
              ref={inputRef}
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={`Message #general as ${displayName}...`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(event);
                }
              }}
              aria-label="Write a message"
            />
            <span className="character-count">{draft.length}/{MAX_MESSAGE_LENGTH}</span>
            <button className="send-button" type="submit" disabled={!draft.trim() || sending} aria-label="Send message" title="Send message">{sending ? '…' : '↑'}</button>
          </form>
          <div className="composer-hint"><span>↵</span> to send <span className="hint-separator">·</span> Shift + ↵ for a new line <span className="hint-right">Please be kind. This is a shared room.</span></div>
          <div className="privacy-note">This is a shared room. Don't post passwords, phone numbers, addresses, or other private information.</div>
        </div>
      </section>
    </main>
  );
}

export default App;
