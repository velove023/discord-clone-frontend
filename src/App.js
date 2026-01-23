import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

// Gunakan environment variable atau default ke localhost untuk development
const BACKEND_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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

  const loadConversations = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/dm`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load conversations');
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      console.error('Load conversations error:', err);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmMessages]);

  useEffect(() => {
    if (!socket) return;

    const handleNewDM = (data) => {
      if (selectedDM && data.from === selectedDM.otherUser) {
        setDmMessages(prev => [...prev, data.message]);
      }
      loadConversations();
    };

    const handleDMSent = (data) => {
      if (selectedDM && data.to === selectedDM.otherUser) {
        setDmMessages(prev => [...prev, data.message]);
      }
    };

    const handleUserTypingDM = (data) => {
      if (selectedDM && data.from === selectedDM.otherUser) {
        setIsTyping(true);
        setTimeout(() => setIsTyping(false), 2000);
      }
    };

    socket.on('new-dm', handleNewDM);
    socket.on('dm-sent', handleDMSent);
    socket.on('user-typing-dm', handleUserTypingDM);

    return () => {
      socket.off('new-dm', handleNewDM);
      socket.off('dm-sent', handleDMSent);
      socket.off('user-typing-dm', handleUserTypingDM);
    };
  }, [socket, selectedDM]); // eslint-disable-line react-hooks/exhaustive-deps

  const startDM = async (username) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/dm/${username}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to start DM');
      const data = await res.json();
      
      const otherUser = data.participants.find(p => p !== currentUser.username);
      setSelectedDM({ ...data, otherUser });
      setDmMessages(data.messages || []);
      setSearchUser('');

      // Mark as read
      await fetch(`${BACKEND_URL}/api/dm/${data._id}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Start DM error:', err);
      alert('Failed to start DM: ' + err.message);
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
    <div className="dm-view">
      <div className="dm-header">
        <button onClick={onBack} className="btn-back">← Back</button>
        <h2>Direct Messages</h2>
      </div>

      <div className="dm-container">
        <div className="dm-sidebar">
          <div className="dm-search">
            <input
              type="text"
              placeholder="Search username..."
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchUser && startDM(searchUser)}
            />
            {searchUser && (
              <button onClick={() => startDM(searchUser)}>Start DM</button>
            )}
          </div>

          <div className="conversations-list">
            {conversations.map((conv) => {
              const otherUser = conv.participants.find(p => p !== currentUser.username);
              return (
                <div
                  key={conv._id}
                  className={`conversation-item ${selectedDM?._id === conv._id ? 'active' : ''}`}
                  onClick={() => startDM(otherUser)}
                >
                  <div className="conversation-user">{otherUser}</div>
                  {conv.unreadCount > 0 && (
                    <span className="unread-badge">{conv.unreadCount}</span>
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
                <h3>@ {selectedDM.otherUser}</h3>
              </div>
              
              <div className="dm-messages">
                {(dmMessages || []).map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`dm-message ${msg.sender === currentUser.username ? 'sent' : 'received'}`}
                  >
                    <div className="dm-message-author">{msg.sender}</div>
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
            <div className="dm-placeholder">
              <p>Select a conversation or start a new DM</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== PROFILE MODAL ====================
const ProfileModal = ({ currentUser, token, onClose, onUpdate }) => {
  const [avatar, setAvatar] = useState(currentUser.avatar || '');
  const [customStatus, setCustomStatus] = useState(currentUser.customStatus || '');
  const [status, setStatus] = useState(currentUser.status || 'online');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ avatar, customStatus, status, bio })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update profile');
      }
      
      const data = await res.json();
      onUpdate(data);
      onClose();
    } catch (err) {
      console.error('Profile update error:', err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Profile</h2>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="modal-content">
          <div className="form-group">
            <label>Avatar URL</label>
            <input
              type="text"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
          </div>
          <div className="form-group">
            <label>Bio</label>
            <input
              type="text"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself"
              maxLength="100"
            />
          </div>
          <div className="form-group">
            <label>Custom Status</label>
            <input
              type="text"
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              placeholder="What's on your mind?"
              maxLength="50"
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
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleUpdate} className="btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== SEARCH MODAL ====================
const SearchModal = ({ token, onClose, onSelectMessage }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/search?query=${encodeURIComponent(searchTerm)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error('Search error:', err);
      alert('Search failed: ' + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Search Messages</h2>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="modal-content">
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              placeholder="Search messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
            <button type="submit" disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </form>

          <div className="search-results">
            {searchResults.map((result) => (
              <div 
                key={result._id} 
                className="search-result-item"
                onClick={() => {
                  onSelectMessage(result.channel);
                  onClose();
                }}
              >
                <div className="search-result-header">
                  <span className="search-result-channel">#{result.channel}</span>
                  <span className="search-result-author">{result.username}</span>
                  <span className="search-result-time">
                    {new Date(result.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="search-result-message">{result.message}</div>
              </div>
            ))}
            {searchResults.length === 0 && searchTerm && !isSearching && (
              <div className="no-results">No messages found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN APP COMPONENT ====================
function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [authError, setAuthError] = useState('');
  
  const [socket, setSocket] = useState(null);
  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState('general');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isTyping, setIsTyping] = useState('');
  
  const [darkMode, setDarkMode] = useState(true);
  const [currentView, setCurrentView] = useState('chat');
  const [showProfile, setShowProfile] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [unreadCount] = useState(0);
  
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Admin Panel States
  const [allUsers, setAllUsers] = useState([]);

  // Theme initialization
  useEffect(() => {
    document.body.className = darkMode ? 'dark-mode' : 'light-mode';
  }, [darkMode]);

  // Load channels
  const loadChannels = async () => {
    if (!token || !currentUser) return;
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/channels`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load channels');
      const data = await res.json();
      setChannels(data);
      if (data.length > 0 && !currentChannel) {
        setCurrentChannel(data[0].name);
      }
    } catch (err) {
      console.error('Load channels error:', err);
    }
  };

  // Load channels when user is authenticated
  useEffect(() => {
    if (token && currentUser) {
      loadChannels();
    }
  }, [token, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load messages for current channel
  const loadMessages = async () => {
    if (!currentChannel || !token) return;
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/messages/${currentChannel}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load messages');
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Load messages error:', err);
    }
  };

  // Initialize socket connection
  useEffect(() => {
    if (token && currentUser) {
      const newSocket = io(BACKEND_URL, {
        transports: ['websocket', 'polling'],
        auth: { token }
      });
      
      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('Socket connected');
        newSocket.emit('user-join', { 
          username: currentUser.username, 
          token 
        });
      });

      newSocket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
      });

      newSocket.on('users-update', (users) => {
        setOnlineUsers(users);
      });

      newSocket.on('user-typing', (data) => {
        if (data.channel === currentChannel) {
          setIsTyping(data.username);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping('');
          }, 2000);
        }
      });

      newSocket.on('channel-created', () => {
        loadChannels();
      });

      newSocket.on('channel-deleted', () => {
        loadChannels();
      });

      newSocket.on('new-message', (message) => {
        if (message.channel === currentChannel) {
          setMessages(prev => [...prev, message]);
        }
      });

      newSocket.on('message-edited', (data) => {
        setMessages(prev => 
          prev.map(msg => msg._id === data.messageId ? { 
            ...msg, 
            message: data.message, 
            edited: true,
            editedAt: data.editedAt 
          } : msg)
        );
      });

      newSocket.on('message-deleted', (data) => {
        setMessages(prev => prev.filter(msg => msg._id !== data.messageId));
      });

      newSocket.on('reaction-updated', (data) => {
        setMessages(prev =>
          prev.map(msg => msg._id === data.messageId ? { 
            ...msg, 
            reactions: data.reactions 
          } : msg)
        );
      });

      return () => {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        newSocket.disconnect();
      };
    }
  }, [token, currentUser, currentChannel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load messages when channel changes
  useEffect(() => {
    if (socket && currentChannel) {
      socket.emit('join-channel', currentChannel);
      loadMessages();
    }
  }, [currentChannel, socket]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Admin functions
  const loadAllUsers = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setAllUsers(data);
    } catch (err) {
      console.error('Load users error:', err);
    }
  };

  useEffect(() => {
    if (currentView === 'admin' && currentUser && currentUser.role === 'admin') {
      loadAllUsers();
    }
  }, [currentView, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Authentication handler
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = isLogin ? '/api/login' : '/api/register';
    
    try {
      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isLogin ? { username, password } : { username, email, password })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Authentication failed');
      }
      
      const data = await res.json();
      
      if (data.token) {
        setToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem('token', data.token);
      } else {
        throw new Error('No token received');
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setCurrentUser(null);
    setMessages([]);
    setChannels([]);
    setOnlineUsers([]);
    if (socket) {
      socket.disconnect();
    }
  };

  // Message handling
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((newMessage.trim() || attachments.length > 0) && socket) {
      const messageData = {
        channel: currentChannel,
        username: currentUser.username,
        message: newMessage,
        token,
        attachments: attachments,
        mentions: extractMentions(newMessage)
      };

      socket.emit('send-message', messageData);
      setNewMessage('');
      setAttachments([]);
    }
  };

  const extractMentions = (text) => {
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[1]);
    }
    return mentions;
  };

  const handleTyping = () => {
    if (socket && currentUser) {
      socket.emit('typing', { 
        channel: currentChannel, 
        username: currentUser.username 
      });
    }
  };

  // File upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setAttachments(prev => [...prev, data]);
    } catch (err) {
      console.error('Upload error:', err);
      alert('Failed to upload file: ' + err.message);
    }
  };

  // Channel management
  const createChannel = async () => {
    const name = prompt('Enter channel name:');
    if (!name) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create channel');
      }
      
      loadChannels();
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteChannel = async (channelId, channelName) => {
    if (!window.confirm(`Delete channel #${channelName}? This will also delete all messages in this channel.`)) {
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/channels/${channelId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete channel');
      }
      
      loadChannels();
      if (channelName === currentChannel) {
        setCurrentChannel('general');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Message actions
  const handleEditMessage = async (messageId, newText) => {
    if (socket && newText.trim()) {
      socket.emit('edit-message', { 
        messageId, 
        newMessage: newText, 
        token 
      });
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Delete this message?')) return;

    if (socket) {
      socket.emit('delete-message', { 
        messageId, 
        token 
      });
    }
  };

  const handleReaction = async (messageId, emoji) => {
    if (socket) {
      socket.emit('react-message', { 
        messageId, 
        emoji, 
        token 
      });
    }
  };

  const handleMention = (username) => {
    setNewMessage(prev => `${prev}@${username} `);
  };

  // Profile update
  const handleProfileUpdate = (updatedUser) => {
    setCurrentUser(updatedUser);
  };

  // Admin actions
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
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to change role');
      }
      
      loadAllUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleBanUser = async (userId, username) => {
    if (!window.confirm(`Ban user ${username}?`)) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          duration: 24, // 24 hours
          reason: 'Violation of community guidelines'
        })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to ban user');
      }
      
      loadAllUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUnbanUser = async (userId, username) => {
    if (!window.confirm(`Unban user ${username}?`)) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}/unban`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to unban user');
      }
      
      loadAllUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Permanently delete user ${username}? This cannot be undone!`)) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }
      
      loadAllUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  // Login/Register UI
  if (!currentUser) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h1>Discord Clone</h1>
          <h2>{isLogin ? 'Welcome Back!' : 'Create Account'}</h2>
          <form onSubmit={handleAuth}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            {!isLogin && (
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            )}
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength="6"
            />
            {authError && (
              <div className="auth-error">{authError}</div>
            )}
            <button type="submit">{isLogin ? 'Login' : 'Register'}</button>
          </form>
          <p onClick={() => setIsLogin(!isLogin)} className="toggle-auth">
            {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
          </p>
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

  // Admin Panel
  if (currentView === 'admin' && currentUser.role === 'admin') {
    return (
      <div className="admin-panel">
        <div className="admin-header">
          <button onClick={() => setCurrentView('chat')} className="btn-back">← Back to Chat</button>
          <h1>Admin Dashboard</h1>
        </div>

        <div className="admin-content">
          <div className="admin-section">
            <h2>User Management ({allUsers.length} users)</h2>
            {allUsers.length > 0 ? (
              <div className="users-table-container">
                <table className="users-table">
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
                          <strong>{user.username}</strong>
                          {user._id === currentUser.id && ' (You)'}
                        </td>
                        <td>{user.email}</td>
                        <td>
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user._id, e.target.value)}
                            disabled={user._id === currentUser.id}
                          >
                            <option value="member">Member</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td>
                          <span className={`status-badge ${user.status || 'offline'}`}>
                            {user.status || 'offline'}
                          </span>
                        </td>
                        <td>
                          {user.isBanned ? (
                            <span className="banned-badge">
                              ✖ {user.bannedUntil ? `Until ${new Date(user.bannedUntil).toLocaleDateString()}` : 'Permanent'}
                            </span>
                          ) : (
                            <span className="not-banned">✓ Active</span>
                          )}
                        </td>
                        <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                        <td>
                          <div className="action-buttons">
                            {user.isBanned ? (
                              <button 
                                onClick={() => handleUnbanUser(user._id, user.username)}
                                className="btn-success-small"
                                disabled={user._id === currentUser.id}
                              >
                                Unban
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleBanUser(user._id, user.username)}
                                className="btn-warning-small"
                                disabled={user._id === currentUser.id}
                              >
                                Ban
                              </button>
                            )}
                            <button 
                              onClick={() => handleDeleteUser(user._id, user.username)}
                              className="btn-delete"
                              disabled={user._id === currentUser.id}
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
            ) : (
              <p>Loading users...</p>
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
          Discord Clone
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
          {channels.length > 0 ? (
            channels.map(channel => (
              <div
                key={channel._id}
                className={`channel ${currentChannel === channel.name ? 'active' : ''}`}
                onClick={() => setCurrentChannel(channel.name)}
              >
                <span># {channel.name}</span>
                {currentUser.role === 'admin' && channel._id && (
                  <button
                    className="delete-channel-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChannel(channel._id, channel.name);
                    }}
                    title="Delete Channel"
                  >
                    ×
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="no-channels">No channels available</div>
          )}
        </div>

        <div className="user-info">
          <div className="user-details" onClick={() => setShowProfile(true)}>
            <img src={currentUser.avatar} alt={currentUser.username} className="user-avatar-small" />
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
          {messages.length > 0 ? (
            messages.map((msg) => (
              <MessageComponent
                key={msg._id}
                msg={msg}
                currentUser={currentUser}
                onEdit={handleEditMessage}
                onDelete={handleDeleteMessage}
                onReact={handleReaction}
                onMention={handleMention}
              />
            ))
          ) : (
            <div className="no-messages">
              No messages yet in #{currentChannel}. Start the conversation!
            </div>
          )}
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
            accept="image/*,.pdf,.doc,.docx"
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
            onKeyDown={handleTyping}
          />
          <button type="submit" disabled={!newMessage.trim() && attachments.length === 0}>
            Send
          </button>
        </form>
      </div>

      {/* Online Users Sidebar */}
      <div className="users-sidebar">
        <div className="users-header">ONLINE - {onlineUsers.length}</div>
        {onlineUsers.length > 0 ? (
          onlineUsers.map((user, index) => (
            <div 
              key={index} 
              className="user"
              onClick={() => {
                if (user.username !== currentUser.username) {
                  setCurrentView('dm');
                  // In a real app, you would open DM with this user
                }
              }}
              style={{ cursor: user.username !== currentUser.username ? 'pointer' : 'default' }}
              title={user.username !== currentUser.username ? "Click to send DM" : "This is you"}
            >
              <span className={`user-status ${user.status || 'online'}`}></span>
              <div className="user-info-sidebar">
                <div>
                  {user.username}
                  {user.username === currentUser.username && ' (You)'}
                </div>
                {user.role !== 'member' && (
                  <div className="user-role-badge">{user.role}</div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="no-online-users">No one else is online</div>
        )}
      </div>
    </div>
  );
}

export default App;