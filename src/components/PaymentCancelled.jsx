import { useNavigate, useSearchParams } from 'react-router-dom';
import NavBar from './NavBarTemp';
import styles from './Payment.module.css';

export default function PaymentCancelled() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const txId = searchParams.get('tx');

  return (
    <>
      <NavBar />

      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.successCard}>
            <div className={styles.waitingIconWrap}>
              <i className="fas fa-circle-xmark" />
            </div>

            <h2>Payment cancelled</h2>

            <p className={styles.successSub}>
              You cancelled the Stripe payment. Your transaction has not been
              paid yet.
            </p>

            <div className={styles.successActions}>
              {txId && (
                <button
                  className={styles.primaryBtn}
                  onClick={() => navigate(`/payment/${txId}`)}
                >
                  Try payment again
                </button>
              )}

              <button
                className={styles.ghostBtn}
                onClick={() => navigate('/my-purchases')}
              >
                Back to purchases
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}