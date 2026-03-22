import { useState, useEffect } from "react";
import axios from "axios";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ChatPage from "./pages/ChatPage";

function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("login");

  
  return page === "signup" ? (
    <SignupPage setUser={setUser} setPage={setPage} />
  ) : page === "login" ? (
    <LoginPage setUser={setUser} setPage={setPage} />
  ) : (
    <ChatPage user={user} />
  );
}

export default App;
