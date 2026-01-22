import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const BACKEND_URL = 'https://discord-clone-backend-3sdm.onrender.com';

// ==================== EMOJI PICKER COMPONENT ====================
const EmojiPicker = ({ onSelect, onClose }) => {
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '👏', '✅'];
  
  return (
    <div className="emoji-picker">
      {emojis.map(emoji => (
        <button
          key={emoji}
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="emoji-button"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};

// ==================== MESSAGE COMPONENT ====================
const MessageComponent = ({ 
  msg, 
  currentUser, 
  onEdit, 
  onDelete, 
  onReact,
  onMention 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.message);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleEdit = () => {
    onEdit(msg._id, editText);
    setIsEditing(false);
  };

  const handleReaction = (emoji) => {
    onReact(msg._id, emoji);
    setShowEmoji(false);
  };

  const isOwnMessage = msg.username === currentUser.username;
  const canModerate = currentUser.role === 'admin' || currentUser.role === 'moderator';

  return (
    <div className={`message ${isOwnMessage ? 'own-message' : ''}`}>
      <div className="message-header">
        <span className="message-author" onClick={() => onMention(msg.username)}>
          {msg.username}
        </span>
        <span className="message-time">
          {new Date(msg.timestamp).toLocaleTimeString()}
          {msg.edited && <span className="edited-badge"> (edited)</span>}
        </span>
        {(isOwnMessage || canModerate) && (
          <button 
            className="message-menu-btn"
            onClick={() => setShowMenu(!showMenu)}
          >
            ⋮
          </button>
        )}
      </div>

      {showMenu && (
        <div className="message-menu">
          {isOwnMessage && (
            <button onClick={() => setIsEditing(true)}>✏️ Edit</button>
          )}
          {(isOwnMessage || canModerate) && (
            <button onClick={() => onDelete(msg._id)}>🗑️ Delete</button>
          )}
        </div>
      )}

      {isEditing ? (
        <div className="message-edit">
          <input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleEdit()}
          />
          <button onClick={handleEdit}>Save</button>
          <button onClick={() => setIsEditing(false)}>Cancel</button>
        </div>
      ) : (
        <div className="message-content">
          {msg.message}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="message-attachments">
              {msg.attachments.map((att, idx) => (
                <div key={idx} className="attachment">
                  {att.fileType?.startsWith('image/') ? (
                    <img src={att.url} alt={att.filename} className="attachment-image" />
                  ) : (
                    <a href={att.url} target="_blank" rel="noopener noreferrer">
                      📎 {att.filename}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="message-reactions">
        {msg.reactions && msg.reactions.map((reaction, idx) => (
          <button
            key={idx}
            className={`reaction ${reaction.users.includes(currentUser.username) ? 'active' : ''}`}
            onClick={() => handleReaction(reaction.emoji)}
            title={reaction.users.join(', ')}
          >
            {reaction.emoji} {reaction.users.length}
          </button>
        ))}
        <button 
          className="add-reaction-btn"
          onClick={() => setShowEmoji(!showEmoji)}
        >
          +
        </button>
        {showEmoji && (
          <EmojiPicker 
            onSelect={handleReaction}
            onClose={() => setShowEmoji(false)}
          />
        )}
      </div>
    </div>
  );
};

// ==================== DIRECT MESSAGE COMPONENT ====================
const DirectMessageView = ({ 
  currentUser, 
  token, 
  socket, 
  onBack 
}) => {
  const [conversations, setConversations] = useState([]);
  const [selectedDM, setSelectedDM] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [newDMMessage, setNewDMMessage] = useState('');
  const [searchUser, setSearchUser] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmMessages]);

  useEffect(() => {
    if (!socket) return;

    socket.on('new-dm', (data) => {
      if (selectedDM && data.from === selectedDM.otherUser) {
        setDmMessages(prev => [...prev, data.message]);
      }
      loadConversations();
    });

    socket.on('dm-sent', (data) => {
      if (selectedDM && data.to === selectedDM.otherUser) {
        setDmMessages(prev => [...prev, data.message]);
      }
    });

    socket.on('user-typing-dm', (from) => {
      if (selectedDM && from === selectedDM.otherUser) {
        setIsTyping(true);
        setTimeout(() => setIsTyping(false), 2000);
      }
    });

    return () => {
      socket.off('new-dm');
      socket.off('dm-sent');
      socket.off('user-typing-dm');
    };
  }, [socket, selectedDM]);

  const loadConversations = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/dm`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      console.error('Load conversations error:', err);
    }
  };

  const startDM = async (username) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/dm/${username}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      const otherUser = data.participants.find(p => p !== currentUser.username);
      setSelectedDM({ ...data, otherUser });
      setDmMessages(data.messages);
      setSearchUser('');

      // Mark as read
      await fetch(`${BACKEND_URL}/api/dm/${data._id}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Start DM error:', err);
    }
  };

  const sendDM = (e) => {
    e.preventDefault();
    if (newDMMessage.trim() && socket && selectedDM) {
      socket.emit('send-dm', {
        to: selectedDM.otherUser,
        from: currentUser.username,
        message: newDMMessage,
        token
      });
      setNewDMMessage('');
    }
  };

  const handleTyping = () => {
    if (socket && selectedDM) {
      socket.emit('typing-dm', {
        to: selectedDM.otherUser,
        from: currentUser.username
      });
    }
  };

  return (
    <div className="dm-container">
      <div className="dm-sidebar">
        <div className="dm-header">
          <button onClick={onBack} className="back-btn">← Back</button>
          <h3>Direct Messages</h3>
        </div>

        <div className="dm-search">
          <input
            type="text"
            placeholder="Start new DM..."
            value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && searchUser.trim()) {
                startDM(searchUser.trim());
              }
            }}
          />
        </div>

        <div className="dm-list">
          {conversations.map((conv) => {
            const otherUser = conv.participants.find(p => p !== currentUser.username);
            const unreadCount = conv.messages.filter(
              m => m.sender !== currentUser.username && !m.read
            ).length;

            return (
              <div
                key={conv._id}
                className={`dm-item ${selectedDM?._id === conv._id ? 'active' : ''}`}
                onClick={() => {
                  const other = conv.participants.find(p => p !== currentUser.username);
                  setSelectedDM({ ...conv, otherUser: other });
                  setDmMessages(conv.messages);
                }}
              >
                <div className="dm-user">{otherUser}</div>
                {unreadCount > 0 && (
                  <span className="unread-badge">{unreadCount}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="dm-chat">
        {selectedDM ? (
          <>
            <div className="dm-chat-header">
              <h3>@{selectedDM.otherUser}</h3>
            </div>

            <div className="dm-messages">
              {dmMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`dm-message ${msg.sender === currentUser.username ? 'sent' : 'received'}`}
                >
                  <div className="dm-message-content">{msg.message}</div>
                  <div className="dm-message-time">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="typing-indicator">{selectedDM.otherUser} is typing...</div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendDM} className="dm-input">
              <input
                type="text"
                placeholder={`Message @${selectedDM.otherUser}`}
                value={newDMMessage}
                onChange={(e) => setNewDMMessage(e.target.value)}
                onKeyPress={handleTyping}
              />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <div className="dm-empty">
            <p>Select a conversation or start a new one</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== PROFILE MODAL ====================
const ProfileModal = ({ currentUser, token, onClose, onUpdate }) => {
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [bio, setBio] = useState(currentUser.bio);
  const [customStatus, setCustomStatus] = useState(currentUser.customStatus);
  const [status, setStatus] = useState(currentUser.status);
  const [uploading, setUploading] = useState(false);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const res = await fetch(`${BACKEND_URL}/api/profile/avatar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      setAvatar(data.avatar);
      alert('Avatar updated!');
    } catch (err) {
      alert('Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ avatar, bio, customStatus, status })
      });
      const data = await res.json();
      onUpdate(data);
      alert('Profile updated!');
      onClose();
    } catch (err) {
      alert('Failed to update profile');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Edit Profile</h2>
        
        <div className="profile-avatar-section">
          <img src={avatar} alt="Avatar" className="profile-avatar-large" />
          <label className="upload-btn">
            {uploading ? 'Uploading...' : 'Change Avatar'}
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        <div className="form-group">
          <label>Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about yourself..."
            maxLength={200}
          />
        </div>

        <div className="form-group">
          <label>Custom Status</label>
          <input
            type="text"
            value={customStatus}
            onChange={(e) => setCustomStatus(e.target.value)}
            placeholder="What's on your mind?"
            maxLength={50}
          />
        </div>

        <div className="form-group">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="online">🟢 Online</option>
            <option value="away">🟡 Away</option>
            <option value="busy">🔴 Busy</option>
            <option value="offline">⚫ Offline</option>
          </select>
        </div>

        <div className="modal-actions">
          <button onClick={handleSave} className="btn-primary">Save</button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ==================== SEARCH MODAL ====================
const SearchModal = ({ token, onClose, onSelectMessage }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/search?query=${encodeURIComponent(query)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content search-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Search Messages</h2>
        
        <div className="search-input-group">
          <input
            type="text"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div className="search-results">
          {results.map((msg) => (
            <div
              key={msg._id}
              className="search-result-item"
              onClick={() => {
                onSelectMessage(msg.channel);
                onClose();
              }}
            >
              <div className="search-result-header">
                <span className="search-result-user">{msg.username}</span>
                <span className="search-result-channel">#{msg.channel}</span>
              </div>
              <div className="search-result-content">{msg.message}</div>
              <div className="search-result-time">
                {new Date(msg.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
          {results.length === 0 && query && !loading && (
            <div className="search-empty">No results found</div>
          )}
        </div>

        <button onClick={onClose} className="btn-secondary">Close</button>
      </div>
    </div>
  );
};

// ==================== MAIN APP COMPONENT ====================
function App() {
  const [socket, setSocket] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [currentView, setCurrentView] = useState('chat');
  
  // Auth state
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  
  // Chat state
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState('general');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isTyping, setIsTyping] = useState('');
  const [attachments, setAttachments] = useState([]);
  
  // UI state
  const [darkMode, setDarkMode] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Admin state
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check for saved token
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const savedDarkMode = localStorage.getItem('darkMode');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setCurrentUser(JSON.parse(savedUser));
      setIsLoggedIn(true);
    }

    if (savedDarkMode !== null) {
      setDarkMode(savedDarkMode === 'true');
    }
  }, []);

  // Apply dark mode
  useEffect(() => {
    document.body.className = darkMode ? 'dark-mode' : 'light-mode';
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // Load channels
  useEffect(() => {
    if (isLoggedIn && token) {
      loadChannels();
    }
  }, [isLoggedIn, token]);

  const loadChannels = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/channels`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setChannels(data);
    } catch (err) {
      console.error('Load channels error:', err);
      // Fallback to default channels
      setChannels([
        { name: 'general', description: 'General chat' },
        { name: 'random', description: 'Random stuff' },
        { name: 'gaming', description: 'Gaming talk' },
        { name: 'music', description: 'Music discussion' }
      ]);
    }
  };

  // Socket connection
  useEffect(() => {
    if (isLoggedIn && token && currentUser) {
      const newSocket = io(BACKEND_URL);
      setSocket(newSocket);

      newSocket.emit('user-join', { username: currentUser.username, token });
      newSocket.emit('join-channel', currentChannel);

      newSocket.on('new-message', (data) => {
        setMessages(prev => [...prev, data]);
        if (data.mentions && data.mentions.includes(currentUser.username)) {
          // Show notification for mention
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`${data.username} mentioned you in #${currentChannel}`, {
              body: data.message
            });
          }
        }
      });

      newSocket.on('message-edited', (data) => {
        setMessages(prev => prev.map(msg => 
          msg._id === data.messageId 
            ? { ...msg, message: data.message, edited: data.edited, editedAt: data.editedAt }
            : msg
        ));
      });

      newSocket.on('message-deleted', (data) => {
        setMessages(prev => prev.filter(msg => msg._id !== data.messageId));
      });

      newSocket.on('reaction-updated', (data) => {
        setMessages(prev => prev.map(msg =>
          msg._id === data.messageId
            ? { ...msg, reactions: data.reactions }
            : msg
        ));
      });

      newSocket.on('users-update', (users) => {
        setOnlineUsers(users);
      });

      newSocket.on('user-typing', (user) => {
        setIsTyping(user);
        setTimeout(() => setIsTyping(''), 2000);
      });

      newSocket.on('mentioned', (data) => {
        alert(`${data.by} mentioned you in #${data.channel}: ${data.message}`);
      });

      newSocket.on('channel-created', (channel) => {
        setChannels(prev => [...prev, channel]);
      });

      newSocket.on('channel-deleted', (data) => {
        setChannels(prev => prev.filter(c => c._id !== data.channelId));
        if (currentChannel === data.name) {
          setCurrentChannel('general');
        }
      });

      newSocket.on('banned', (data) => {
        alert(`You have been banned. Reason: ${data.reason || 'No reason provided'}`);
        handleLogout();
      });

      newSocket.on('auth-error', () => {
        alert('Session expired. Please login again.');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setIsLoggedIn(false);
        setToken('');
        setCurrentUser(null);
      });

      return () => newSocket.close();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, token, currentChannel, currentUser]);

  // Load messages when changing channel
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/messages/${currentChannel}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setMessages(data.messages || []);
      } catch (err) {
        console.error('Load messages error:', err);
      }
    };

    if (isLoggedIn && token) {
      loadMessages();
      if (socket) {
        socket.emit('join-channel', currentChannel);
      }
    }
  }, [currentChannel, isLoggedIn, token, socket]);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      alert('Please fill in all fields');
      return;
    }
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setToken(data.token);
        setCurrentUser(data.user);
        setIsLoggedIn(true);
        
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
        }
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed. Please try again.');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (!username.trim() || !email.trim() || !password.trim()) {
      alert('Please fill in all fields');
      return;
    }
    
    if (password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        alert('Registration successful! Please login.');
        setIsRegistering(false);
        setPassword('');
        setEmail('');
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error('Register error:', error);
      alert('Registration failed. Please try again.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsLoggedIn(false);
    setToken('');
    setCurrentUser(null);
    if (socket) socket.close();
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && attachments.length === 0) return;
    if (!socket) return;

    // Extract mentions
    const mentions = (newMessage.match(/@(\w+)/g) || []).map(m => m.slice(1));

    socket.emit('send-message', {
      channel: currentChannel,
      username: currentUser.username,
      message: newMessage,
      token,
      attachments,
      mentions
    });
    
    setNewMessage('');
    setAttachments([]);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      setAttachments(prev => [...prev, data]);
    } catch (err) {
      alert('Failed to upload file');
    }
  };

  const handleEditMessage = async (messageId, newText) => {
    try {
      await fetch(`${BACKEND_URL}/api/messages/${messageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: newText })
      });
    } catch (err) {
      alert('Failed to edit message');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Delete this message?')) return;

    try {
      await fetch(`${BACKEND_URL}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      alert('Failed to delete message');
    }
  };

  const handleReaction = async (messageId, emoji) => {
    try {
      await fetch(`${BACKEND_URL}/api/messages/${messageId}/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ emoji })
      });
    } catch (err) {
      console.error('Reaction error:', err);
    }
  };

  const handleMention = (username) => {
    setNewMessage(prev => `${prev}@${username} `);
  };

  const handleTyping = () => {
    if (socket) {
      socket.emit('typing', { channel: currentChannel, username: currentUser.username });
    }
  };

  const handleProfileUpdate = (updatedUser) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const createChannel = async () => {
    const name = prompt('Enter channel name:');
    if (!name) return;

    try {
      await fetch(`${BACKEND_URL}/api/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name, description: '' })
      });
      loadChannels();
    } catch (err) {
      alert('Failed to create channel');
    }
  };

  const deleteChannel = async (channelId) => {
    if (!window.confirm('Delete this channel?')) return;

    try {
      await fetch(`${BACKEND_URL}/api/channels/${channelId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      alert('Failed to delete channel');
    }
  };

  // Admin functions
  const loadAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data);
      } else {
        alert('Failed to load users. Admin access required.');
      }
    } catch (error) {
      console.error('Load users error:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ role: newRole })
      });
      
      if (res.ok) {
        alert('Role updated successfully!');
        loadAllUsers();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (error) {
      console.error('Role change error:', error);
    }
  };

  const handleBanUser = async (userId, username) => {
    const duration = prompt('Ban duration in hours (leave empty for permanent):');
    const reason = prompt('Ban reason:');

    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          duration: duration ? parseInt(duration) : null,
          reason 
        })
      });

      if (res.ok) {
        alert(`${username} has been banned`);
        loadAllUsers();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (error) {
      console.error('Ban user error:', error);
    }
  };

  const handleUnbanUser = async (userId, username) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}/unban`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        alert(`${username} has been unbanned`);
        loadAllUsers();
      }
    } catch (error) {
      console.error('Unban user error:', error);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        alert('User deleted successfully!');
        loadAllUsers();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (error) {
      console.error('Delete user error:', error);
    }
  };

  // Login/Register UI
  if (!isLoggedIn) {
    return (
      <div className={`auth-container ${darkMode ? 'dark' : 'light'}`}>
        <div className="auth-box">
          <div className="auth-header">
            <h1>Discord Clone v3.0</h1>
            <p>{isRegistering ? 'Create your account' : 'Welcome back!'}</p>
          </div>

          <form onSubmit={isRegistering ? handleRegister : handleLogin}>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            {isRegistering && (
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength="6"
              />
              {isRegistering && (
                <small className="form-hint">Must be at least 6 characters</small>
              )}
            </div>

            <button type="submit" className="btn-primary">
              {isRegistering ? 'Register' : 'Login'}
            </button>
          </form>

          <div className="auth-switch">
            {isRegistering ? (
              <>
                Already have an account?{' '}
                <button onClick={() => {
                  setIsRegistering(false);
                  setEmail('');
                }} className="btn-link">
                  Login
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button onClick={() => setIsRegistering(true)} className="btn-link">
                  Register
                </button>
              </>
            )}
          </div>

          <div className="theme-toggle">
            <button onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // DM View
  if (currentView === 'dm') {
    return (
      <DirectMessageView
        currentUser={currentUser}
        token={token}
        socket={socket}
        onBack={() => setCurrentView('chat')}
      />
    );
  }

  // Admin Dashboard... (continues in next file due to length)
  // Admin Dashboard
  if (currentView === 'admin') {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>Admin Dashboard</h1>
          <div className="admin-actions">
            <button onClick={() => setCurrentView('chat')} className="btn-secondary">
              Back to Chat
            </button>
            <button onClick={() => setDarkMode(!darkMode)} className="btn-secondary">
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button onClick={handleLogout} className="btn-danger">
              Logout
            </button>
          </div>
        </div>

        <div className="admin-content">
          <div className="admin-stats">
            <div className="stat-card">
              <h3>Total Users</h3>
              <p className="stat-number">{allUsers.length}</p>
            </div>
            <div className="stat-card">
              <h3>Online Users</h3>
              <p className="stat-number">{onlineUsers.length}</p>
            </div>
            <div className="stat-card">
              <h3>Total Channels</h3>
              <p className="stat-number">{channels.length}</p>
            </div>
          </div>

          <div className="users-section">
            <div className="section-header">
              <h2>All Users</h2>
              <button onClick={loadAllUsers} className="btn-primary" disabled={loadingUsers}>
                {loadingUsers ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {allUsers.length === 0 ? (
              <p className="empty-state">Click "Refresh" to load users</p>
            ) : (
              <div className="users-table">
                <table>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Banned</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map(user => (
                      <tr key={user._id}>
                        <td>
                          <div className="user-cell">
                            <img src={user.avatar} alt="" className="user-avatar-tiny" />
                            {user.username}
                          </div>
                        </td>
                        <td>{user.email}</td>
                        <td>
                          <select 
                            value={user.role} 
                            onChange={(e) => handleRoleChange(user._id, e.target.value)}
                            className="role-select"
                          >
                            <option value="member">Member</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td>
                          <span className={`status-badge ${user.status}`}>
                            {user.status}
                          </span>
                        </td>
                        <td>
                          {user.isBanned ? (
                            <span className="banned-badge">
                              ✖ {user.bannedUntil ? 'Temp' : 'Perm'}
                            </span>
                          ) : (
                            <span className="not-banned">✓</span>
                          )}
                        </td>
                        <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                        <td>
                          <div className="action-buttons">
                            {user.isBanned ? (
                              <button 
                                onClick={() => handleUnbanUser(user._id, user.username)}
                                className="btn-success-small"
                              >
                                Unban
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleBanUser(user._id, user.username)}
                                className="btn-warning-small"
                              >
                                Ban
                              </button>
                            )}
                            <button 
                              onClick={() => handleDeleteUser(user._id, user.username)}
                              className="btn-delete"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main Chat UI
  return (
    <div className="app">
      {/* Modals */}
      {showProfile && (
        <ProfileModal
          currentUser={currentUser}
          token={token}
          onClose={() => setShowProfile(false)}
          onUpdate={handleProfileUpdate}
        />
      )}

      {showSearch && (
        <SearchModal
          token={token}
          onClose={() => setShowSearch(false)}
          onSelectMessage={(channel) => setCurrentChannel(channel)}
        />
      )}

      {/* Sidebar - Channels */}
      <div className="sidebar">
        <div className="server-name">
          My Server
          <div className="user-badge">{currentUser.role}</div>
        </div>
        
        <div className="channels">
          <div className="channels-header">
            CHANNELS
            {currentUser.role === 'admin' && (
              <button onClick={createChannel} className="add-channel-btn" title="Create Channel">
                +
              </button>
            )}
          </div>
          {channels.map(channel => (
            <div
              key={channel._id || channel.name}
              className={`channel ${currentChannel === channel.name ? 'active' : ''}`}
              onClick={() => setCurrentChannel(channel.name)}
            >
              <span># {channel.name}</span>
              {currentUser.role === 'admin' && channel._id && (
                <button
                  className="delete-channel-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChannel(channel._id);
                  }}
                  title="Delete Channel"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="user-info">
          <div className="user-details" onClick={() => setShowProfile(true)}>
            <img src={currentUser.avatar} alt="" className="user-avatar-small" />
            <div>
              <div className="username">{currentUser.username}</div>
              <div className="user-role-text">{currentUser.role}</div>
              {currentUser.customStatus && (
                <div className="custom-status">{currentUser.customStatus}</div>
              )}
            </div>
          </div>
          <button 
            onClick={() => setDarkMode(!darkMode)} 
            className="btn-icon" 
            title="Toggle Theme"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} className="btn-logout" title="Logout">
            ⎋
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="main">
        <div className="chat-header">
          <h2># {currentChannel}</h2>
          <div className="header-actions">
            <button onClick={() => setShowSearch(true)} className="btn-icon" title="Search">
              🔍
            </button>
            <button onClick={() => setCurrentView('dm')} className="btn-secondary">
              💬 Direct Messages
              {unreadCount > 0 && (
                <span className="unread-badge-small">{unreadCount}</span>
              )}
            </button>
            {currentUser.role === 'admin' && (
              <button onClick={() => setCurrentView('admin')} className="btn-admin">
                ⚙️ Admin Dashboard
              </button>
            )}
          </div>
        </div>
        
        <div className="messages">
          {messages.map((msg) => (
            <MessageComponent
              key={msg._id}
              msg={msg}
              currentUser={currentUser}
              onEdit={handleEditMessage}
              onDelete={handleDeleteMessage}
              onReact={handleReaction}
              onMention={handleMention}
            />
          ))}
          {isTyping && (
            <div className="typing-indicator">{isTyping} is typing...</div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {attachments.length > 0 && (
          <div className="attachment-preview">
            {attachments.map((att, idx) => (
              <div key={idx} className="attachment-item">
                <span>{att.filename}</span>
                <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSendMessage} className="message-input">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="attach-btn"
            title="Attach File"
          >
            📎
          </button>
          <input
            type="text"
            placeholder={`Message #${currentChannel} (use @username to mention)`}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleTyping}
          />
          <button type="submit">Send</button>
        </form>
      </div>

      {/* Online Users Sidebar */}
      <div className="users-sidebar">
        <div className="users-header">ONLINE - {onlineUsers.length}</div>
        {onlineUsers.map((user, index) => (
          <div 
            key={index} 
            className="user"
            onClick={() => {
              setCurrentView('dm');
              // Auto-start DM with clicked user
            }}
            style={{ cursor: 'pointer' }}
            title="Click to send DM"
          >
            <span className={`user-status ${user.status || 'online'}`}></span>
            <div className="user-info-sidebar">
              <div>{user.username}</div>
              {user.role !== 'member' && (
                <div className="user-role-badge">{user.role}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;