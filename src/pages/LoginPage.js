import { useState } from "react";
import axios from "axios";

export default function LoginPage({ setUser, setPage }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Helper to convert VAPID key
  function urlBase64ToUint8Array(base64String) {
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

  const login = async () => {
  try {
    const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/user/login`, { email, password });
    console.log("Login response:", res.data);
    const { user, token } = res.data;
    localStorage.setItem("token", token);
    setUser(user);
    setPage("chat");
  } catch (e) {
    if (e.response?.status === 400) alert("Invalid email or password");
    else alert("Login failed");
  }
};


  return (
    <div style={{ padding: 50, background: "#e0f7ff", minHeight: "100vh" }}>
      <h2>Login</h2>
      <input placeholder="Email" onChange={e => setEmail(e.target.value)} /><br /><br />
      <input placeholder="Password" type="password" onChange={e => setPassword(e.target.value)} /><br /><br />
      <button onClick={login}>Login</button>
      <p style={{ marginTop: 10 }}>
        New user? <span style={{ color: "blue", cursor: "pointer" }} onClick={() => setPage("signup")}>Signup</span>
      </p>
    </div>
    
  );
}
