import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const BACKEND_URL = 'https://discord-clone-backend-3sdm.onrender.com';

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
  const [currentChannel, setCurrentChannel] = useState('general');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isTyping, setIsTyping] = useState('');
  
  // Admin state
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  const messagesEndRef = useRef(null);
  const channels = ['general', 'random', 'gaming', 'music'];

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check for saved token
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setCurrentUser(JSON.parse(savedUser));
      setIsLoggedIn(true);
    }
  }, []);

  // Socket connection
  useEffect(() => {
    if (isLoggedIn && token && currentUser) {
      const newSocket = io(BACKEND_URL);
      setSocket(newSocket);

      newSocket.emit('user-join', { username: currentUser.username, token });
      newSocket.emit('join-channel', currentChannel);

      newSocket.on('new-message', (data) => {
        setMessages(prev => [...prev, data]);
      });

      newSocket.on('users-update', (users) => {
        setOnlineUsers(users);
      });

      newSocket.on('user-typing', (user) => {
        setIsTyping(user);
        setTimeout(() => setIsTyping(''), 2000);
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
    
    // Manual validation untuk login
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
    
    // Manual validation untuk register
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

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      socket.emit('send-message', {
        channel: currentChannel,
        username: currentUser.username,
        message: newMessage,
        token
      });
      setNewMessage('');
    }
  };

  const handleTyping = () => {
    if (socket) {
      socket.emit('typing', { channel: currentChannel, username: currentUser.username });
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
      <div className="auth-container">
        <div className="auth-box">
          <div className="auth-header">
            <h1>Discord Clone</h1>
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
        </div>
      </div>
    );
  }

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
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map(user => (
                      <tr key={user._id}>
                        <td>{user.username}</td>
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
                        <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                        <td>
                          <button 
                            onClick={() => handleDeleteUser(user._id, user.username)}
                            className="btn-delete"
                          >
                            Delete
                          </button>
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
      {/* Sidebar - Channels */}
      <div className="sidebar">
        <div className="server-name">
          My Server
          <div className="user-badge">{currentUser.role}</div>
        </div>
        
        <div className="channels">
          <div className="channels-header">CHANNELS</div>
          {channels.map(channel => (
            <div
              key={channel}
              className={`channel ${currentChannel === channel ? 'active' : ''}`}
              onClick={() => setCurrentChannel(channel)}
            >
              # {channel}
            </div>
          ))}
        </div>

        <div className="user-info">
          <div className="user-details">
            <div className="username">{currentUser.username}</div>
            <div className="user-role-text">{currentUser.role}</div>
          </div>
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
            {currentUser.role === 'admin' && (
              <button onClick={() => setCurrentView('admin')} className="btn-admin">
                Admin Dashboard
              </button>
            )}
          </div>
        </div>
        
        <div className="messages">
          {messages.map((msg, index) => (
            <div key={index} className="message">
              <div className="message-header">
                <span className="message-author">{msg.username}</span>
                <span className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="message-content">{msg.message}</div>
            </div>
          ))}
          {isTyping && (
            <div className="typing-indicator">{isTyping} is typing...</div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="message-input">
          <input
            type="text"
            placeholder={`Message #${currentChannel}`}
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
          <div key={index} className="user">
            <span className="user-status"></span>
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