import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export default function Dashboard({ user}) {

  const rows = [
    ["User Type",  user.userType  || "—"],
    ["First Name", user.firstName || "—"],
    ["Last Name",  user.lastName  || "—"],
    ["Email",      user.email     || "—"],
  ];

  return (
    <div className="dashboard">
      <div className="dash-card">
        <h1>Profile</h1>

        {rows.map(([label, value]) => (
          <div className="dash-row" key={label}>
            {label}: <span>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
