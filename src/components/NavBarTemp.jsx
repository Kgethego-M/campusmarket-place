import { useNavigate, useLocation } from "react-router-dom";
import styles from "./NavBar.module.css";

const NAV_LINKS = [
    { label: "Browse",         path: "/view-listing" },
    { label: "Trade Facility", path: null },
    { label: "Messages",       path: null },
    { label: "View Cart",      path: null },
];

export default function Navbar() {
    const navigate  = useNavigate();
    const location  = useLocation();

    return (
        <header className={styles.navbar}>
            {/* Logo */}
            <div className={styles.logo} onClick={() => navigate("/view-listing")}>
                <div className={styles.logoBox} />
                <span className={styles.logoText}>CampusMarket</span>
            </div>

            {/* Nav links */}
            <nav className={styles.navLinks}>
                {NAV_LINKS.map((link) => {
                    const isActive = link.path && location.pathname === link.path;
                    return (
                        <button
                            key={link.label}
                            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""} ${!link.path ? styles.navLinkDisabled : ""}`}
                            onClick={() => link.path && navigate(link.path)}
                            disabled={!link.path}
                        >
                            {link.label}
                        </button>
                    );
                })}
            </nav>

            {/* Right side */}
            <div className={styles.navRight}>
                <button
                    className={styles.sellBtn}
                    onClick={() => navigate("/create-listing")}
                >
                    + Sell Item
                </button>
                <div className={styles.avatar}>
                    <span>S</span>
                </div>
            </div>
        </header>
    );
}