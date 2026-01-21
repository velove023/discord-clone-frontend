import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const BACKEND_URL = 'discord-clone-backend-production-9a84.up.railway.app'; // Ganti dengan URL Railway nanti

function App() {
  const [socket, setSocket] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [currentChannel, setCurrentChannel] = useState('general');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isTyping, setIsTyping] = useState('');
  const messagesEndRef = useRef(null);

  const channels = ['general', 'random', 'gaming', 'music'];

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Socket connection
  useEffect(() => {
    if (isLoggedIn) {
      const newSocket = io(BACKEND_URL);
      setSocket(newSocket);

      newSocket.emit('user-join', username);
      newSocket.emit('join-channel', currentChannel);

      // Listen for new messages
      newSocket.on('new-message', (data) => {
        setMessages(prev => [...prev, data]);
      });

      // Listen for online users
      newSocket.on('users-update', (users) => {
        setOnlineUsers(users);
      });

      // Listen for typing indicator
      newSocket.on('user-typing', (user) => {
        setIsTyping(user);
        setTimeout(() => setIsTyping(''), 2000);
      });

      return () => newSocket.close();
    }
  }, [isLoggedIn, username, currentChannel]);

  // Load messages when changing channel
  useEffect(() => {
    if (isLoggedIn) {
      fetch(`${BACKEND_URL}/api/messages/${currentChannel}`)
        .then(res => res.json())
        .then(data => setMessages(data))
        .catch(err => console.error(err));
      
      if (socket) {
        socket.emit('join-channel', currentChannel);
      }
    }
  }, [currentChannel, isLoggedIn, socket]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setIsLoggedIn(true);
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        alert('Registration successful! Please login.');
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error('Register error:', error);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      socket.emit('send-message', {
        channel: currentChannel,
        username,
        message: newMessage
      });
      setNewMessage('');
    }
  };

  const handleTyping = () => {
    if (socket) {
      socket.emit('typing', { channel: currentChannel, username });
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>Discord Clone</h1>
          <form onSubmit={handleLogin}>
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
            <button type="submit">Login</button>
            <button type="button" onClick={handleRegister}>Register</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Sidebar - Channels */}
      <div className="sidebar">
        <div className="server-name">My Server</div>
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
      </div>

      {/* Main Chat Area */}
      <div className="main">
        <div className="chat-header">
          <h2># {currentChannel}</h2>
        </div>
        
        <div className="messages">
          {messages.map((msg, index) => (
            <div key={index} className="message">
              <span className="message-author">{msg.username}</span>
              <span className="message-time">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
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

      {/* Online Users */}
      <div className="users-sidebar">
        <div className="users-header">ONLINE - {onlineUsers.length}</div>
        {onlineUsers.map((user, index) => (
          <div key={index} className="user">
            <span className="user-status"></span>
            {user}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;