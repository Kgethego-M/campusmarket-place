const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, serverTimestamp } = require('firebase/firestore');
 
const firebaseConfig = {
  apiKey: "AIzaSyC9zduc8VPxBGtJsytoJWzOSwwXbqoDPIo",
  authDomain: "campusmarketplace-34f57.firebaseapp.com",
  projectId: "campusmarketplace-34f57",
  storageBucket: "campusmarketplace-34f57.firebasestorage.app",
  messagingSenderId: "194723320309",
  appId: "1:194723320309:web:076f0251c2d7af6f9610bc",
};
 
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
 
const users = [
  { uid: 'UE0gCvtGY5NkDkqwMePbEs7WI173', name: 'Mpeane Mphelane' },
  { uid: 'i1jc8kpeloThnE5peyFnqO6AgZE2', name: 'Athalia Mamba' },
  { uid: 'iyqS6bIbAlU9wf8t6iHSr5U4vhC3', name: 'Nontokozo Mbatha' },
  { uid: 'rYFCPQnGI2g7zrjXdVHPEeQ9REP2', name: 'Tebogo Sebopela' },
  { uid: 'Hm7PVlVyeahNMjp6rUTVSnWMVLW2', name: 'Victor Hyginus' },
  { uid: 'JwTr0dsXbfh2CmHeEJDkTHgapMH2', name: 'Mmaphefo Thobejane' },
];
 
const fakeListings = [
  { title: 'MacBook Pro 2021', price: 8000, category: 'Electronics' },
  { title: 'Calculus Textbook', price: 250, category: 'Books' },
  { title: 'Nike Air Force 1', price: 900, category: 'Clothing' },
  { title: 'Wireless Headphones', price: 1200, category: 'Electronics' },
  { title: 'Desk Lamp', price: 150, category: 'Furniture' },
  { title: 'Python Programming Book', price: 300, category: 'Books' },
  { title: 'Gaming Mouse', price: 600, category: 'Electronics' },
  { title: 'Backpack', price: 400, category: 'Accessories' },
  { title: 'Mini Fridge', price: 1500, category: 'Appliances' },
  { title: 'Bluetooth Speaker', price: 700, category: 'Electronics' },
  { title: 'Yoga Mat', price: 200, category: 'Sports' },
  { title: 'Mechanical Keyboard', price: 850, category: 'Electronics' },
];
 
const purchasePairs = [
  { sellerId: users[0].uid, buyerId: users[1].uid },
  { sellerId: users[0].uid, buyerId: users[2].uid },
  { sellerId: users[1].uid, buyerId: users[3].uid },
  { sellerId: users[1].uid, buyerId: users[4].uid },
  { sellerId: users[2].uid, buyerId: users[5].uid },
  { sellerId: users[2].uid, buyerId: users[0].uid },
  { sellerId: users[3].uid, buyerId: users[1].uid },
  { sellerId: users[3].uid, buyerId: users[5].uid },
  { sellerId: users[4].uid, buyerId: users[2].uid },
  { sellerId: users[4].uid, buyerId: users[3].uid },
  { sellerId: users[5].uid, buyerId: users[0].uid },
  { sellerId: users[5].uid, buyerId: users[4].uid },
];
 
const seed = async () => {
  console.log('🌱 Creating listings...');
  const listingIds = [];
 
  for (const listing of fakeListings) {
    const docRef = await addDoc(collection(db, 'listings'), {
      title: listing.title,
      price: listing.price,
      category: listing.category,
      status: 'sold',
      type: 'For Sale',
      createdAt: serverTimestamp(),
    });
    listingIds.push(docRef.id);
    console.log(`✅ Listing created: ${listing.title} → ${docRef.id}`);
  }
 
  console.log('\n🌱 Creating purchases...');
  for (let i = 0; i < purchasePairs.length; i++) {
    const p = purchasePairs[i];
    const listingId = listingIds[i];
    await addDoc(collection(db, 'Purchases'), {
      buyerId: p.buyerId,
      sellerId: p.sellerId,
      listingId,
      status: 'completed',
      type: 'For Sale',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log(`✅ Purchase: seller ${p.sellerId} → buyer ${p.buyerId} | listing ${listingId}`);
  }
 
  console.log('\n🎉 Done! 12 listings and 12 purchases created.');
};
 
seed().catch(console.error);