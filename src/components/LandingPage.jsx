export default function LandingPage({ onGetStarted }) {
  return (
    <div className="app-wrapper">
      {/* Header */}
      <div className="main-header">
        <div className="logo-block">
          <div className="logo-icon">
            <i className="fa-solid fa-shop"></i>
          </div>
          <div className="app-title">
            Campus<span>Market</span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="hero-grid">
        <div className="hero-text">
          <div className="uni-tag">
            <i className="fas fa-university"></i> peer-to-peer · campus ONLY
          </div>
          <h1 className="main-headline">
            Buy, Sell &amp; Trade <span className="accent">Smarter</span>
            <br />within your university
          </h1>
          <p className="desc-text">
            Textbooks, electronics, furniture, or clothing — connect with verified
            students from your own campus. Safe drop-off points, online payments,
            and cash top-up via integrated platform.
          </p>
          <div className="feature-list">
            <div className="feature-item">
              <i className="fas fa-check-circle"></i> Campus-secure trade hubs
            </div>
            <div className="feature-item">
              <i className="fas fa-credit-card"></i> Online payments + shortfall
            </div>
            <div className="feature-item">
              <i className="fas fa-shield-alt"></i> Student ID verified
            </div>
          </div>
          <button className="btn-get-started" onClick={onGetStarted}>
            Get started <i className="fas fa-arrow-right"></i>
          </button>
        </div>

        <div className="hero-image">
          <div className="image-card">
            <img src="/landing1.jpeg" alt="Campus marketplace" />
          </div>
        </div>
      </div>
    </div>
  );
}
