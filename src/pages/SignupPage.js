import { useState } from "react"
import axios from "axios"

export default function SignupPage({ setUser, setPage }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")

  const signup = async () => {
    try {
      const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/user/signup`, { name, email, password, phone })
      console.log('Signup response:', res.data)
      const { user, token } = res.data;
      localStorage.setItem("token", token);
      setUser(user)
      setPage('chat')
    } catch (e) {
      if (e.response?.status === 400) alert(e.response.data)
      else alert("Signup failed")
    }
  }

  return (
    <div style={{ padding: 50, background: "#e0f7ff", minHeight: "100vh" }}>
      <h2>Signup</h2>
      <input placeholder="Name" onChange={e => setName(e.target.value)} /><br /><br />
      <input placeholder="Email" onChange={e => setEmail(e.target.value)} /><br /><br />
      <input placeholder="Password" type="password" onChange={e => setPassword(e.target.value)} /><br /><br />
      <input placeholder="Phone Number" onChange={e => setPhone(e.target.value)} /><br /><br />
      <button onClick={signup}>Signup</button>
      <p style={{ marginTop: 10 }}>
        Already registered? <span style={{ color: "blue", cursor: "pointer" }} onClick={() => setPage('login')}>Login</span>
      </p>
    </div>
  )
}