import React from 'react';
import { useParams } from 'react-router-dom';

export default function ReviewOffer() {
  const { transactionId } = useParams();
  
  return (
    <div style={{ padding: '100px', textAlign: 'center' }}>
      <h1>Review Offer Page</h1>
      <p>Transaction ID: {transactionId}</p>
      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
        <button style={{ background: 'green', color: 'white' }}>Accept</button>
        <button style={{ background: 'red', color: 'white' }}>Decline</button>
      </div>
    </div>
  );
}