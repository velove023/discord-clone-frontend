import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/dm`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      console.error('Load conversations error:', err);
    }
  }, [token]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

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

    const handleUserTypingDM = (from) => {
      if (selectedDM && from === selectedDM.otherUser) {
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
  }, [socket, selectedDM, loadConversations]);

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
      socket.emit('typing-dm', { to: selectedDM.otherUser });
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
                {dmMessages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`dm-message ${msg.from === currentUser.username ? 'sent' : 'received'}`}
                  >
                    <div className="dm-message-author">{msg.from}</div>
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

  const handleUpdate = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ avatar, customStatus, status })
      });
      const data = await res.json();
      onUpdate(data.user);
      onClose();
    } catch (err) {
      console.error('Profile update error:', err);
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
              <option value="invisible">⚫ Invisible</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleUpdate} className="btn-primary">Save Changes</button>
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
      const res = await fetch(`${BACKEND_URL}/api/messages/search?q=${searchTerm}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error('Search error:', err);
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
  const [isLogin, setIsLogin] = useState(true);
  
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

  // Admin Panel States
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    document.body.className = darkMode ? 'dark-mode' : 'light-mode';
  }, [darkMode]);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/channels`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setChannels(data);
    } catch (err) {
      console.error('Load channels error:', err);
    }
  }, [token]);

  useEffect(() => {
    if (token && currentUser) {
      loadChannels();
    }
  }, [token, currentUser, loadChannels]);

  useEffect(() => {
    if (token && currentUser) {
      const newSocket = io(BACKEND_URL, {
        auth: { token }
      });
      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('Socket connected');
        newSocket.emit('join-channel', currentChannel);
      });

      newSocket.on('online-users', (users) => {
        setOnlineUsers(users);
      });

      newSocket.on('user-typing', (username) => {
        setIsTyping(username);
        setTimeout(() => setIsTyping(''), 2000);
      });

      newSocket.on('channel-created', () => {
        loadChannels();
      });

      newSocket.on('channel-deleted', () => {
        loadChannels();
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [token, currentUser, loadChannels]);

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/messages/${currentChannel}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error('Load messages error:', err);
    }
  }, [currentChannel, token]);

  useEffect(() => {
    if (socket && currentChannel) {
      socket.emit('join-channel', currentChannel);
      loadMessages();
    }
  }, [currentChannel, socket, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      if (message.channel === currentChannel) {
        setMessages(prev => [...prev, message]);
      }
    };

    const handleMessageEdited = (data) => {
      setMessages(prev => 
        prev.map(msg => msg._id === data.messageId ? { ...msg, message: data.newMessage, edited: true } : msg)
      );
    };

    const handleMessageDeleted = (data) => {
      setMessages(prev => prev.filter(msg => msg._id !== data.messageId));
    };

    const handleMessageReacted = (data) => {
      setMessages(prev =>
        prev.map(msg => msg._id === data.messageId ? { ...msg, reactions: data.reactions } : msg)
      );
    };

    socket.on('new-message', handleNewMessage);
    socket.on('message-edited', handleMessageEdited);
    socket.on('message-deleted', handleMessageDeleted);
    socket.on('message-reacted', handleMessageReacted);

    return () => {
      socket.off('new-message', handleNewMessage);
      socket.off('message-edited', handleMessageEdited);
      socket.off('message-deleted', handleMessageDeleted);
      socket.off('message-reacted', handleMessageReacted);
    };
  }, [socket, currentChannel]);

  // Admin Functions - Define loadAllUsers early
  const loadAllUsers = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAllUsers(data);
    } catch (err) {
      console.error('Load users error:', err);
    }
  }, [token]);

  // Load users when admin panel is active
  useEffect(() => {
    if (currentView === 'admin' && currentUser && currentUser.role === 'admin') {
      loadAllUsers();
    }
  }, [currentView, currentUser, loadAllUsers]);

  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    
    try {
      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      
      if (data.token) {
        setToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem('token', data.token);
      } else {
        alert(data.message || 'Authentication failed');
      }
    } catch (err) {
      alert('Connection error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setCurrentUser(null);
    if (socket) socket.disconnect();
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() || attachments.length > 0) {
      const messageData = {
        channel: currentChannel,
        message: newMessage,
        attachments: attachments,
        token
      };

      if (socket) {
        socket.emit('send-message', messageData);
        setNewMessage('');
        setAttachments([]);
      }
    }
  };

  const handleTyping = () => {
    if (socket) {
      socket.emit('typing', { channel: currentChannel, username: currentUser.username });
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      setAttachments(prev => [...prev, ...data.files]);
    } catch (err) {
      console.error('Upload error:', err);
    }
  };

  const createChannel = async () => {
    const name = prompt('Enter channel name:');
    if (name) {
      try {
        await fetch(`${BACKEND_URL}/api/channels`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ name })
        });
        loadChannels();
      } catch (err) {
        console.error('Create channel error:', err);
      }
    }
  };

  const deleteChannel = async (channelId) => {
    if (window.confirm('Delete this channel?')) {
      try {
        await fetch(`${BACKEND_URL}/api/channels/${channelId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        loadChannels();
        if (channels.find(c => c._id === channelId)?.name === currentChannel) {
          setCurrentChannel('general');
        }
      } catch (err) {
        console.error('Delete channel error:', err);
      }
    }
  };

  const handleEditMessage = async (messageId, newText) => {
    if (socket) {
      socket.emit('edit-message', { messageId, newMessage: newText, token });
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (window.confirm('Delete this message?')) {
      if (socket) {
        socket.emit('delete-message', { messageId, token });
      }
    }
  };

  const handleReaction = async (messageId, emoji) => {
    if (socket) {
      socket.emit('react-message', { messageId, emoji, token });
    }
  };

  const handleMention = (username) => {
    setNewMessage(prev => `${prev}@${username} `);
  };

  const handleProfileUpdate = (updatedUser) => {
    setCurrentUser(updatedUser);
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await fetch(`${BACKEND_URL}/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      loadAllUsers();
    } catch (err) {
      console.error('Role change error:', err);
    }
  };

  const handleBanUser = async (userId, username) => {
    if (window.confirm(`Ban user ${username}?`)) {
      try {
        await fetch(`${BACKEND_URL}/api/admin/users/${userId}/ban`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        loadAllUsers();
      } catch (err) {
        console.error('Ban user error:', err);
      }
    }
  };

  const handleUnbanUser = async (userId, username) => {
    if (window.confirm(`Unban user ${username}?`)) {
      try {
        await fetch(`${BACKEND_URL}/api/admin/users/${userId}/unban`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        loadAllUsers();
      } catch (err) {
        console.error('Unban user error:', err);
      }
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (window.confirm(`Permanently delete user ${username}? This cannot be undone!`)) {
      try {
        await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        loadAllUsers();
      } catch (err) {
        console.error('Delete user error:', err);
      }
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
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
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
            <h2>User Management</h2>
            {allUsers.length > 0 ? (
              <div className="users-table-container">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Username</th>
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
                        <td>{user.username}</td>
                        <td>
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user._id, e.target.value)}
                            disabled={user.username === currentUser.username}
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
