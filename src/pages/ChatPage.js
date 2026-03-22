import { useEffect, useState, useRef } from "react"
import { io } from "socket.io-client"
import axios from "axios"
import SimplePeer from "simple-peer"

const socket = io(process.env.REACT_APP_BACKEND_URL);

export default function ChatPage({ user }) {
  const [arr, setArr] = useState([]) // Chat list
  const [sel, setSel] = useState(null) // Selected user
  const [msg, setMsg] = useState("") // Message input
  const [list, setList] = useState([]) // Messages
  const [online, setOnline] = useState([]) // Online users
  const [typingUser, setTypingUser] = useState("")
  const [search, setSearch] = useState("")
  const [searchResult, setSearchResult] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)
  const [onCall, setOnCall] = useState(false)
  const [currentCallId, setCurrentCallId] = useState(null)
  const [isVideoCall, setIsVideoCall] = useState(false)
  
  // Important contacts & features
  const [importantContacts, setImportantContacts] = useState([])
  const [showScheduleMsg, setShowScheduleMsg] = useState(false)
  const [scheduleTime, setScheduleTime] = useState("")
  const [scheduleMsg, setScheduleMsg] = useState("")
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  
  // WebRTC refs
  const peerRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const localAudioRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const callDataRef = useRef(null)
  const alarmAudioRef = useRef(null)

  // Subscribe to notifications on mount and handle permissions
  useEffect(() => {
    // Load important contacts from localStorage
    const saved = localStorage.getItem("importantContacts")
    if (saved) setImportantContacts(JSON.parse(saved))

    // Mobile responsive
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", handleResize)

    // Request microphone permission early
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        console.log("Microphone permission granted")
        stream.getTracks().forEach(track => track.stop())
      })
      .catch(err => {
        console.error("Microphone permission error:", err)
        // Permission denied - will handle in call function
      })

    if ("serviceWorker" in navigator && "Notification" in window) {
      navigator.serviceWorker.register("/sw.js")
        .then(registration => {
          console.log("Service Worker registered");
          
          // Request notification permission
          if (Notification.permission === "default") {
            Notification.requestPermission().then(permission => {
              if (permission === "granted") {
                console.log("Notification permission granted")
              }
            })
          }

          // Subscribe to push notifications
          if (Notification.permission === "granted" && user?.phone) {
            registration.pushManager.getSubscription()
              .then(subscription => {
                if (!subscription) {
                  // Create new subscription if VAPID key exists
                  const vapidKey = process.env.REACT_APP_VAPID_PUBLIC_KEY
                  if (vapidKey && vapidKey !== "Your_VAPID_Public_Key") {
                    return registration.pushManager.subscribe({
                      userVisibleOnly: true,
                      applicationServerKey: urlBase64ToUint8Array(vapidKey)
                    })
                  }
                }
                return subscription
              })
              .then(subscription => {
                if (subscription) {
                  // Save subscription to backend
                  axios.post(`${process.env.REACT_APP_BACKEND_URL}/user/subscribe`, {
                    phone: user.phone,
                    subscription: subscription
                  })
                  .catch(err => console.log("Subscription save error:", err))
                }
              })
              .catch(err => console.log("Subscription error:", err));
          }
        })
        .catch(err => console.log("SW registration failed:", err));
    }

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [user?.phone])

  // Helper function to convert VAPID key
  const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Load chat list
  useEffect(() => {
    const f = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/chat/getChats`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        setArr(res.data)
      } catch (e) {
        console.error("Error loading chats:", e)
      }
    }
    if (user) f()
  }, [user])

  // Load messages for selected user
  const load = async (u) => {
    setSel(u)
    const r = [user.phone, u.phone].sort().join("_")
    socket.emit("join_room", r)
    const token = localStorage.getItem("token");
    try {
      const res = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/chat/getMessages/${u.phone}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setList(res.data)
      // Mark all messages as delivered and read
      setTimeout(() => {
        res.data.forEach(m => {
          if (m.receiver === user.phone && !m.delivered) {
            socket.emit("message_delivered", { messageId: m._id, room: r })
          }
          if (m.receiver === user.phone && !m.read) {
            socket.emit("message_read", { messageId: m._id, room: r, reader: user.phone })
          }
        })
      }, 100)
    } catch (e) {
      console.error("Error loading messages:", e)
    }
  }

  // Socket listeners
  useEffect(() => {
    socket.emit("user_online", user?.phone)

    socket.on("online_users", setOnline)

    socket.on("receive_message", m => {
      setList(prev => [...prev, m])
      // Auto mark as delivered when received
      if (m.receiver === user.phone && sel?.phone === m.sender) {
        socket.emit("message_delivered", { 
          messageId: m._id, 
          room: m.room 
        })
      }
      
      // Check if message is from important contact
      if (m.receiver === user.phone && importantContacts.includes(m.sender)) {
        playAlarm()
        // Show important notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("🔔 IMPORTANT MESSAGE!", {
            body: `From: ${m.senderName || m.sender}`,
            tag: "important-msg",
            requireInteraction: true
          })
        }
      }
    })

    socket.on("message_delivered", ({ messageId }) => {
      setList(prev => prev.map(m => 
        m._id === messageId ? { ...m, delivered: true, received: true } : m
      ))
    })

    socket.on("message_read", ({ messageId }) => {
      setList(prev => prev.map(m => 
        m._id === messageId ? { ...m, read: true } : m
      ))
    })

    // Call events
    socket.on("incoming_call", ({ caller, callerName, callId, isVideoCall }) => {
      setIncomingCall({ caller, callerName, callId, isVideoCall })
      setIsVideoCall(isVideoCall || false)
      // Play notification sound if available
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(isVideoCall ? "📹 Incoming Video Call" : "📞 Incoming Call", {
          body: `${callerName} is calling...`,
          icon: "/phone-icon.png",
          requireInteraction: true
        })
      }
    })

    socket.on("call_accepted", ({ callId }) => {
      setOnCall(true)
      setCurrentCallId(callId)
      // WebRTC connection will be established through signal exchange
    })

    socket.on("webrtc_signal", ({ signal, from }) => {
      if (peerRef.current) {
        peerRef.current.signal(signal)
      }
    })

    socket.on("call_rejected", ({ callId }) => {
      // Clean up WebRTC resources
      if (peerRef.current) {
        peerRef.current.destroy()
        peerRef.current = null
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
        localStreamRef.current = null
      }
      alert("Call rejected")
      setOnCall(false)
      setCurrentCallId(null)
    })

    socket.on("call_ended", ({ callId }) => {
      // Clean up WebRTC resources
      if (peerRef.current) {
        peerRef.current.destroy()
        peerRef.current = null
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
        localStreamRef.current = null
      }
      if (remoteStreamRef.current) {
        remoteStreamRef.current.getTracks().forEach(track => track.stop())
        remoteStreamRef.current = null
      }
      setOnCall(false)
      setCurrentCallId(null)
    })

    socket.on("call_failed", ({ message }) => {
      alert(message)
    })

    return () => {
      socket.off("online_users")
      socket.off("receive_message")
      socket.off("message_delivered")
      socket.off("message_read")
      socket.off("incoming_call")
      socket.off("call_accepted")
      socket.off("webrtc_signal")
      socket.off("call_rejected")
      socket.off("call_ended")
      socket.off("call_failed")
    }
  }, [user?.phone, sel?.phone])

  // Typing indicator
  useEffect(() => {
    let t
    socket.on("typing", u => {
      setTypingUser(u)
      clearTimeout(t)
      t = setTimeout(() => setTypingUser(""), 2000)
    })
    return () => socket.off("typing")
  }, [])

  // Send message
  const send = () => {
    if (!msg || !sel) return

    const r = [user.phone, sel.phone].sort().join("_")
    const data = {
      sender: user.phone,
      receiver: sel.phone,
      text: msg,
      room: r,
      senderName: user.name
    }

    socket.emit("send_message", data)
    setMsg("")
  }

  // Search user by phone
  const searchUser = async () => {
    if (!search) return
    const token = localStorage.getItem("token");
    try {
      const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/chat/searchUser`, 
        { phone: search },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSearchResult(res.data)
    } catch (e) {
      console.error("User not found:", e)
      setSearchResult(null)
    }
  }

  // Important Contacts Management
  const toggleImportantContact = (phone) => {
    let updated
    if (importantContacts.includes(phone)) {
      updated = importantContacts.filter(p => p !== phone)
    } else {
      updated = [...importantContacts, phone]
    }
    setImportantContacts(updated)
    localStorage.setItem("importantContacts", JSON.stringify(updated))
  }

  // Play alarm for important message
  const playAlarm = () => {
    // Create oscillator for beep sound  
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    oscillator.frequency.value = 1000
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    
    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.5)
    
    // Play 3 beeps
    setTimeout(() => playAlarmBeep(audioContext, 1500), 600)
    setTimeout(() => playAlarmBeep(audioContext, 1500), 1200)
  }

  const playAlarmBeep = (audioContext, freq) => {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    oscillator.frequency.value = freq
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.5)
  }

  // Schedule message
  const scheduleMessage = async () => {
    if (!sel || !scheduleTime || !scheduleMsg) return
    
    try {
      const token = localStorage.getItem("token")
      await axios.post(`${process.env.REACT_APP_BACKEND_URL}/chat/scheduleMessage`, {
        sender: user.phone,
        receiver: sel.phone,
        text: scheduleMsg,
        scheduledTime: scheduleTime
      }, { headers: { Authorization: `Bearer ${token}` } })
      
      alert("Message scheduled successfully!")
      setShowScheduleMsg(false)
      setScheduleMsg("")
      setScheduleTime("")
    } catch (err) {
      console.error("Schedule error:", err)
      alert("Failed to schedule message")
    }
  }

  // Initiate call with video option
  const initiateCall = async (withVideo = false) => {
    if (!sel || onCall) return
    
    try {
      // Get user's audio/video stream
      const stream = await getLocalStream(withVideo)
      if (!stream) {
        alert("Unable to access microphone/camera. Please check permissions.")
        return
      }

      setIsVideoCall(withVideo)

      // Create peer connection as initiator
      const peer = createPeerConnection({
        initiator: true,
        stream,
        onStream: (remoteStream) => {
          remoteStreamRef.current = remoteStream
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream
          }
          if (remoteVideoRef.current && withVideo) {
            remoteVideoRef.current.srcObject = remoteStream
          }
        }
      })

      // Handle peer signals
      peer.on("signal", handleSignal)
      peer.on("stream", (remoteStream) => {
        remoteStreamRef.current = remoteStream
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream
        }
        if (remoteVideoRef.current && withVideo) {
          remoteVideoRef.current.srcObject = remoteStream
        }
      })
      peer.on("error", (err) => {
        console.error("Peer error:", err)
      })

      peerRef.current = peer
      callDataRef.current = { initiated: true, stream, peer }

      // Emit call initiation
      const callId = `${user.phone}_${Date.now()}`
      socket.emit("initiate_call", {
        caller: user.phone,
        callee: sel.phone,
        callerName: user.name,
        isVideoCall: withVideo
      })
      
      setOnCall(true)
      setCurrentCallId(callId)
    } catch (err) {
      console.error("Error initiating call:", err)
      alert("Error starting call: " + err.message)
    }
  }

  // Accept call with WebRTC
  const acceptCall = async (withVideo = false) => {
    if (!incomingCall) return
    
    try {
      // Get user's audio/video stream
      const stream = await getLocalStream(withVideo)
      if (!stream) {
        alert("Unable to access microphone/camera. Please check permissions.")
        return
      }

      setIsVideoCall(withVideo)

      // Create peer connection as non-initiator
      const peer = createPeerConnection({
        initiator: false,
        stream,
        onStream: (remoteStream) => {
          remoteStreamRef.current = remoteStream
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream
          }
          if (remoteVideoRef.current && withVideo) {
            remoteVideoRef.current.srcObject = remoteStream
          }
        }
      })

      // Handle peer signals
      peer.on("signal", handleSignal)
      peer.on("stream", (remoteStream) => {
        remoteStreamRef.current = remoteStream
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream
        }
        if (remoteVideoRef.current && withVideo) {
          remoteVideoRef.current.srcObject = remoteStream
        }
      })
      peer.on("error", (err) => {
        console.error("Peer error:", err)
      })

      peerRef.current = peer
      callDataRef.current = { initiated: false, stream, peer }

      // Emit call acceptance
      socket.emit("accept_call", {
        callId: incomingCall.callId,
        callee: user.phone,
        caller: incomingCall.caller,
        isVideoCall: withVideo
      })

      setIncomingCall(null)
      setOnCall(true)
    } catch (err) {
      console.error("Error accepting call:", err)
      alert("Error accepting call: " + err.message)
    }
  }

  // Get user's audio/video stream
  const getLocalStream = async (withVideo = false) => {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: withVideo ? {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } : false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      localStreamRef.current = stream
      
      if (withVideo && localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      } else if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream
      }
      
      console.log("Local stream acquired", withVideo ? "with video" : "audio only")
      return stream
    } catch (err) {
      console.error("Error accessing audio/video:", err)
      if (err.name === "NotAllowedError") {
        console.error("Permission denied - please allow camera/microphone access in browser settings")
      } else if (err.name === "NotFoundError") {
        console.error("No camera/microphone found")
      }
      return null
    }
  }

  // Create WebRTC peer connection
  const createPeerConnection = ({ initiator, stream, onStream, onClose }) => {
    return new SimplePeer({
      initiator,
      trickleIce: true,
      stream,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" }
        ]
      }
    })
  }

  // Handle incoming signal from peer
  const handleSignal = (data) => {
    if (!sel) return
    socket.emit("webrtc_signal", {
      to: sel.phone,
      signal: data,
      from: user.phone
    })
  }

  // Handle receiving signal from peer
  const addSignal = (signal) => {
    if (peerRef.current) {
      peerRef.current.signal(signal)
    }
  }

  // Reject call
  const rejectCall = () => {
    if (!incomingCall) return
    socket.emit("reject_call", {
      callId: incomingCall.callId,
      caller: incomingCall.caller
    })
    setIncomingCall(null)
  }

  // End call with cleanup
  const endCall = () => {
    if (!sel || !currentCallId) return
    
    // Clean up WebRTC resources
    if (peerRef.current) {
      peerRef.current.destroy()
      peerRef.current = null
    }
    
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(track => track.stop())
      remoteStreamRef.current = null
    }

    if (localAudioRef.current) {
      localAudioRef.current.srcObject = null
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }

    callDataRef.current = null

    socket.emit("end_call", {
      callId: currentCallId,
      otherUser: sel.phone
    })
    
    setOnCall(false)
    setCurrentCallId(null)
  }

  // Render message status indicator
  const renderMessageStatus = (m) => {
    if (m.sender !== user.phone) return null
    
    if (m.read) {
      return <span style={{ color: "blue", fontWeight: "bold", fontSize: 14 }}>✓✓</span>
    } else if (m.delivered && m.received) {
      return <span style={{ color: "gray", fontSize: 14 }}>✓✓</span>
    } else if (m.delivered) {
      return <span style={{ color: "lightgray", fontSize: 14 }}>✓</span>
    } else {
      return <span style={{ color: "lightgray", fontSize: 14 }}>✓</span>
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Arial", position: "relative" }}>
      
      {/* Hidden audio elements for call streams */}
      <audio ref={localAudioRef} muted autoPlay playsInline />
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* INCOMING CALL NOTIFICATION */}
      {incomingCall && (
        <div style={{
          position: "fixed",
          top: 20,
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "#fff",
          border: "2px solid #25D366",
          borderRadius: 15,
          padding: 20,
          zIndex: 1000,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          minWidth: 300,
          textAlign: "center"
        }}>
          <h2>📞 Incoming Call</h2>
          <p style={{ fontSize: 16, marginBottom: 15 }}>{incomingCall.callerName} is {incomingCall.isVideoCall ? "📹 video " : ""}calling...</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => acceptCall(incomingCall.isVideoCall)}
              style={{
                padding: "10px 20px",
                backgroundColor: "#25D366",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: 14
              }}
            >
              ✓ Accept {incomingCall.isVideoCall ? "Video" : "Audio"}
            </button>
            <button
              onClick={rejectCall}
              style={{
                padding: "10px 20px",
                backgroundColor: "#FF4444",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: 14
              }}
            >
              ✕ Reject
            </button>
          </div>
        </div>
      )}

      {/* ON CALL INDICATOR */}
      {onCall && (
        <div style={{
          position: "fixed",
          top: 20,
          left: isMobile ? 10 : "50%",
          transform: isMobile ? "none" : "translateX(-50%)",
          backgroundColor: "#25D366",
          color: "white",
          padding: 10,
          borderRadius: 8,
          zIndex: 999,
          width: isMobile ? "90%" : "auto"
        }}>
          {isVideoCall ? "📹 Video Call" : "📞 Audio Call"} with {sel?.name}
          <button
            onClick={endCall}
            style={{
              marginLeft: 15,
              padding: "5px 15px",
              backgroundColor: "#FF4444",
              color: "white",
              border: "none",
              borderRadius: 5,
              cursor: "pointer"
            }}
          >
            End Call
          </button>
        </div>
      )}

      {/* VIDEO DISPLAY AREA DURING CALL */}
      {onCall && isVideoCall && (
        <div style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: isMobile ? "100%" : 300,
          height: isMobile ? "100%" : 300,
          backgroundColor: "#111",
          borderRadius: 10,
          overflow: "hidden",
          zIndex: 998
        }}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: "absolute",
              bottom: 10,
              right: 10,
              width: isMobile ? 100 : 150,
              height: isMobile ? 100 : 150,
              borderRadius: 8,
              border: "2px solid white"
            }}
          />
        </div>
      )}

      {/* LEFT PANEL - CHAT LIST & SEARCH */}
      <div style={{ 
        width: isMobile ? sel ? "0%" : "100%" : "30%", 
        borderRight: "1px solid #ccc", 
        padding: isMobile ? (sel ? 0 : 10) : 15, 
        overflowY: "auto", 
        backgroundColor: "#f9f9f9",
        display: isMobile && sel ? "none" : "block",
        height: "100%"
      }}>
        <h3>💬 Chats</h3>
        
        {/* Search bar */}
        <div style={{ marginBottom: 15 }}>
          <input
            type="tel"
            placeholder="Search by phone"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && searchUser()}
            style={{ 
              width: "100%", 
              padding: 8, 
              marginBottom: 8,
              border: "1px solid #ddd",
              borderRadius: 5,
              boxSizing: "border-box"
            }}
          />
          <button 
            onClick={searchUser} 
            style={{
              width: "100%",
              padding: 8,
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            Search
          </button>
        </div>

        {/* Search result */}
        {searchResult && (
          <div
            onClick={() => {
              load(searchResult)
              setSearchResult(null)
              setSearch("")
            }}
            style={{
              background: "#e3f2fd",
              padding: 10,
              marginBottom: 10,
              borderRadius: 5,
              cursor: "pointer",
              border: "1px solid #90caf9"
            }}
          >
            <strong>🔍 {searchResult.name}</strong>
            <br/>
            <small>{searchResult.phone}</small>
          </div>
        )}

        {/* Chat list */}
        <div style={{ marginTop: 15 }}>
          <h4>Recent Chats</h4>
          {arr.length === 0 ? (
            <p style={{ color: "#999" }}>No chats yet. Search to start a conversation!</p>
          ) : (
            arr.map(u => (
              <div
                key={u._id}
                onClick={() => load(u)}
                style={{
                  cursor: "pointer",
                  padding: 10,
                  marginBottom: 8,
                  borderRadius: 5,
                  backgroundColor: sel?._id === u._id ? "#007bff" : "#fff",
                  color: sel?._id === u._id ? "#fff" : "#000",
                  border: "1px solid #ddd",
                  transition: "all 0.2s"
                }}
              >
                <strong>{u.name}</strong>
                <small style={{ display: "block", fontSize: 12 }}>{u.phone}</small>
                {online.includes(u.phone) && (
                  <small style={{ color: sel?._id === u._id ? "#fff" : "green", fontWeight: "bold" }}>● Online</small>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL - CHAT MESSAGES */}
      <div style={{ 
        width: isMobile ? (sel ? "100%" : "0%") : "70%",
        display: isMobile ? (sel ? "flex" : "none") : "flex",
        flexDirection: "column", 
        padding: isMobile ? 10 : 15,
        height: "100%"
      }}>
        {sel ? (
          <>
            {/* HEADER WITH CALL OPTION */}
            <div style={{ 
              borderBottom: "1px solid #ccc", 
              paddingBottom: 10, 
              marginBottom: 10, 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10
            }}>
              <div>
                <h3 style={{ margin: 0, marginBottom: 5 }}>{sel.name}</h3>
                <small style={{ color: online.includes(sel.phone) ? "green" : "#999" }}>
                  {online.includes(sel.phone) ? "🟢 Online" : "🔘 Offline"}
                </small>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => initiateCall(false)}
                  disabled={!online.includes(sel.phone) || onCall}
                  title="start audio call"
                  style={{
                    padding: isMobile ? "8px 12px" : "10px 20px",
                    backgroundColor: online.includes(sel.phone) && !onCall ? "#25D366" : "#ccc",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    cursor: online.includes(sel.phone) && !onCall ? "pointer" : "not-allowed",
                    fontWeight: "bold",
                    fontSize: isMobile ? 12 : 14
                  }}
                >
                  📞 Call
                </button>
                <button
                  onClick={() => initiateCall(true)}
                  disabled={!online.includes(sel.phone) || onCall}
                  title="start video call"
                  style={{
                    padding: isMobile ? "8px 12px" : "10px 20px",
                    backgroundColor: online.includes(sel.phone) && !onCall ? "#007bff" : "#ccc",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    cursor: online.includes(sel.phone) && !onCall ? "pointer" : "not-allowed",
                    fontWeight: "bold",
                    fontSize: isMobile ? 12 : 14
                  }}
                >
                  📹 Video
                </button>
                <button
                  onClick={() => toggleImportantContact(sel.phone)}
                  title={importantContacts.includes(sel.phone) ? "Remove from important" : "Add to important"}
                  style={{
                    padding: isMobile ? "8px 12px" : "10px 20px",
                    backgroundColor: importantContacts.includes(sel.phone) ? "#FF6B6B" : "#FFB347",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: isMobile ? 12 : 14
                  }}
                >
                  {importantContacts.includes(sel.phone) ? "⭐ Important" : "☆ Add"}
                </button>
              </div>
            </div>

            {/* Messages area */}
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 15, backgroundColor: "#f5f5f5", padding: 10, borderRadius: 5 }}>
              {list.length === 0 ? (
                <p style={{ textAlign: "center", color: "#999" }}>Start a conversation</p>
              ) : (
                list.map((m, i) => (
                  <div
                    key={m._id || i}
                    onMouseEnter={() => {
                      if (m.receiver === user.phone && !m.read) {
                        socket.emit("message_read", { 
                          messageId: m._id, 
                          room: m.room, 
                          reader: user.phone 
                        })
                      }
                    }}
                    style={{
                      marginBottom: 10,
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: m.sender === user.phone ? "#DCF8C6" : "#fff",
                      marginLeft: m.sender === user.phone ? "20%" : 0,
                      marginRight: m.sender !== user.phone ? "20%" : 0,
                      border: "1px solid #ddd"
                    }}
                  >
                    <div>
                      {m.text}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#999" }}>
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </span>
                      {renderMessageStatus(m)}
                    </div>
                  </div>
                ))
              )}
            </div>

            {typingUser && (
              <div style={{ fontStyle: "italic", color: "#999", marginBottom: 5, fontSize: 13 }}>
                ✏️ {typingUser} is typing...
              </div>
            )}

            {/* Message Input */}
            <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ display: "flex", gap: 8, flex: 1 }}>
                <input
                  value={msg}
                  onChange={e => {
                    setMsg(e.target.value)
                    socket.emit("typing_start", {
                      room: [user.phone, sel.phone].sort().join("_"),
                      user: user.name
                    })
                  }}
                  onKeyPress={e => e.key === 'Enter' && send()}
                  placeholder="Type a message..."
                  style={{
                    flex: 1,
                    padding: 10,
                    border: "1px solid #ccc",
                    borderRadius: 5,
                    fontSize: 14
                  }}
                />
                <button 
                  onClick={send}
                  style={{
                    padding: isMobile ? "10px 15px" : "10px 20px",
                    backgroundColor: "#25D366",
                    color: "white",
                    border: "none",
                    borderRadius: 5,
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: isMobile ? 12 : 14,
                    whiteSpace: "nowrap"
                  }}
                >
                  Send
                </button>
              </div>
              <button
                onClick={() => setShowScheduleMsg(!showScheduleMsg)}
                style={{
                  padding: isMobile ? "10px 15px" : "10px 20px",
                  backgroundColor: "#9C27B0",
                  color: "white",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: isMobile ? 12 : 14
                }}
              >
                ⏰ Schedule
              </button>
            </div>

            {/* Schedule Message Form */}
            {showScheduleMsg && (
              <div style={{
                backgroundColor: "#F3E5F5",
                padding: 15,
                borderRadius: 8,
                marginTop: 10,
                border: "1px solid #CE93D8"
              }}>
                <h4 style={{ marginTop: 0 }}>Schedule Message</h4>
                <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row", marginBottom: 10 }}>
                  <input
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={e => setScheduleTime(e.target.value)}
                    style={{
                      flex: 1,
                      padding: 8,
                      border: "1px solid #CE93D8",
                      borderRadius: 5
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Message to send..."
                    value={scheduleMsg}
                    onChange={e => setScheduleMsg(e.target.value)}
                    style={{
                      flex: 1,
                      padding: 8,
                      border: "1px solid #CE93D8",
                      borderRadius: 5
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={scheduleMessage}
                    style={{
                      flex: 1,
                      padding: 10,
                      backgroundColor: "#9C27B0",
                      color: "white",
                      border: "none",
                      borderRadius: 5,
                      cursor: "pointer",
                      fontWeight: "bold"
                    }}
                  >
                    Schedule
                  </button>
                  <button
                    onClick={() => setShowScheduleMsg(false)}
                    style={{
                      padding: 10,
                      backgroundColor: "#ccc",
                      border: "none",
                      borderRadius: 5,
                      cursor: "pointer"
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            height: "100%",
            color: "#999"
          }}>
            <h3>👈 Select a chat to start messaging</h3>
          </div>
        )}
      </div>
    </div>
  )
}