const API_URL = import.meta.env.VITE_API_URL;

export async function fetchListings() {
  try {
    const response = await fetch(`${API_URL}/listings`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch listings:', error);
    throw error;
  }
}

export async function createListing(formData) {
  try {
    const response = await fetch(`${API_URL}/listings`, {
      method: 'POST',
      body: formData, // FormData for multipart (no Content-Type)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to create listing:', error);
    throw error;
  }
}

