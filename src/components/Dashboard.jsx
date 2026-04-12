import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export default function Dashboard({ user, onLogout }) {
  async function handleLogout() {
    try {
      localStorage.removeItem("loggedInUserId");
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    }
    onLogout();
  }

  const rows = [
    ["User Type",  user.userType  || "—"],
    ["First Name", user.firstName || "—"],
    ["Last Name",  user.lastName  || "—"],
    ["Email",      user.email     || "—"],
  ];

  return (
    <div className="dashboard">
      <div className="dash-card">
        <h1>Welcome to your Dashboard 🎉</h1>

        {rows.map(([label, value]) => (
          <div className="dash-row" key={label}>
            {label}: <span>{value}</span>
          </div>
        ))}

        <button className="logout-btn" onClick={handleLogout}>
          <i className="fas fa-right-from-bracket"></i> Logout
        </button>
      </div>
    </div>
  );
}
