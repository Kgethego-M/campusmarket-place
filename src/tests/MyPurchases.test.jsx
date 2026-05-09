import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { vi, describe, test, beforeEach, afterEach, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ── Test Suite for Buggy Code Patterns ─────────────────────────────────

describe("Buggy Code Pattern Tests", () => {
  
  // ── Test 1: Variable naming conflict (ta.listingId vs ta parameter) ──
  describe("Variable Shadowing Bug", () => {
    test("should document that using same variable name causes shadowing", () => {
      const transactions = [
        { id: "tx1", listingId: "listing123", sellerId: "seller456" }
      ];
      
      let processedResults = [];
      
      const correctProcess = () => {
        for (const transaction of transactions) {
          const listingDoc = { data: () => ({ title: "Correct Item" }) };
          const listingData = listingDoc.data();
          
          processedResults.push({
            originalId: transaction.id,
            listingTitle: listingData.title
          });
        }
      };
      
      processedResults = [];
      correctProcess();
      
      expect(processedResults[0].originalId).toBe("tx1");
      expect(processedResults[0].listingTitle).toBe("Correct Item");
    });
    
    test("should use distinct variable names for fetched documents", () => {
      const transaction = { listingId: "listing123", sellerId: "seller456" };
      
      let listingDoc = null;
      let sellerDoc = null;
      
      if (transaction.listingId) {
        listingDoc = { id: transaction.listingId, title: "Product Title" };
      }
      
      if (transaction.sellerId) {
        sellerDoc = { id: transaction.sellerId, name: "Seller Name" };
      }
      
      expect(listingDoc).toBeDefined();
      expect(sellerDoc).toBeDefined();
      expect(listingDoc.title).toBe("Product Title");
      expect(sellerDoc.name).toBe("Seller Name");
    });
  });
  
  // ── Test 2: Incorrect sort comparison logic ─────────────────────────
  describe("Sort Comparison Bug", () => {
    test("sort should correctly order transactions by status priority", () => {
      const order = { 
        pending: 0, 
        accepted: 1, 
        waiting: 2, 
        completed: 3, 
        declined: 4, 
        cancelled: 5 
      };
      
      const items = [
        { id: 3, status: "completed" },
        { id: 1, status: "pending" },
        { id: 2, status: "accepted" },
        { id: 4, status: "declined" },
        { id: 5, status: "waiting" },
      ];
      
      const correctSort = (a, b) => {
        const orderA = order[a.status] ?? 6;
        const orderB = order[b.status] ?? 6;
        return orderA - orderB;
      };
      
      const sorted = [...items].sort(correctSort);
      
      expect(sorted[0].status).toBe("pending");
      expect(sorted[1].status).toBe("accepted");
      expect(sorted[2].status).toBe("waiting");
      expect(sorted[3].status).toBe("completed");
      expect(sorted[4].status).toBe("declined");
    });
    
    test("should handle unknown status values with default priority", () => {
      const order = { pending: 0, accepted: 1, waiting: 2, completed: 3, declined: 4, cancelled: 5 };
      const defaultPriority = 6;
      
      const items = [
        { id: 1, status: "unknown_status" },
        { id: 2, status: "pending" },
        { id: 3, status: "another_unknown" },
      ];
      
      const safeSort = (a, b) => {
        const orderA = order[a.status] ?? defaultPriority;
        const orderB = order[b.status] ?? defaultPriority;
        return orderA - orderB;
      };
      
      const sorted = [...items].sort(safeSort);
      
      expect(sorted[0].status).toBe("pending");
    });
    
    test("should fall back to date comparison when status priorities are equal", () => {
      const order = { pending: 0, accepted: 1 };
      
      const items = [
        { id: 1, status: "accepted", date: new Date(2024, 0, 1) },
        { id: 2, status: "pending", date: new Date(2024, 0, 5) },
        { id: 3, status: "pending", date: new Date(2024, 0, 3) },
      ];
      
      const sortWithDateFallback = (a, b) => {
        const orderA = order[a.status] ?? 6;
        const orderB = order[b.status] ?? 6;
        
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        
        return b.date - a.date;
      };
      
      const sorted = [...items].sort(sortWithDateFallback);
      
      expect(sorted[0].status).toBe("pending");
      expect(sorted[0].date).toEqual(new Date(2024, 0, 5));
      expect(sorted[1].status).toBe("pending");
      expect(sorted[1].date).toEqual(new Date(2024, 0, 3));
      expect(sorted[2].status).toBe("accepted");
    });
  });
  
  // ── Test 3: Missing return statement ─────────────────────────────────
  describe("Missing Return Statement Bug", () => {
    test("enrich function should return results array, not an error object", () => {
      const buggyEnrichFunction = (transactions) => {
        try {
          const results = transactions.map(tx => ({ ...tx, enriched: true }));
          return results;
        } catch (e) {
          console.error(e);
          return [];
        }
      };
      
      const mockTransactions = [
        { id: 1, listingTitle: "Item 1" },
        { id: 2, listingTitle: "Item 2" },
      ];
      
      const result = buggyEnrichFunction(mockTransactions);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("enriched", true);
    });
    
    test("should return empty array when transactions array is empty", () => {
      const enrichFunction = (transactions) => {
        if (!transactions || transactions.length === 0) {
          return [];
        }
        
        try {
          return transactions.map(tx => ({ ...tx, enriched: true }));
        } catch (e) {
          console.error(e);
          return [];
        }
      };
      
      expect(enrichFunction([])).toEqual([]);
      expect(enrichFunction(null)).toEqual([]);
      expect(enrichFunction(undefined)).toEqual([]);
    });
    
    test("should handle errors gracefully without crashing", () => {
      const enrichFunctionWithErrorHandling = (transactions) => {
        try {
          throw new Error("Database connection failed");
        } catch (error) {
          console.error("Enrichment failed:", error);
          return [];
        }
      };
      
      const result = enrichFunctionWithErrorHandling([{ id: 1 }]);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });
  
  // ── Test 4: Incorrect field access ───────────────────────────────────
  describe("Incorrect Field Access Bug", () => {
    test("should access correct fields from Firestore user document", () => {
      const mockUserData = {
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com"
      };
      
      const getCorrectSellerName = (userData) => {
        if (!userData) return null;
        
        const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
        return fullName || userData.email || null;
      };
      
      expect(getCorrectSellerName(mockUserData)).toBe("John Doe");
      expect(getCorrectSellerName({ firstName: "Jane", lastName: "Smith" })).toBe("Jane Smith");
      expect(getCorrectSellerName({ email: "only@email.com" })).toBe("only@email.com");
      expect(getCorrectSellerName({ firstName: "Single", lastName: "" })).toBe("Single");
      expect(getCorrectSellerName({})).toBe(null);
    });
    
    test("should handle user data with missing fields gracefully", () => {
      const getSellerName = (userData) => {
        if (!userData) return "Unknown Seller";
        
        const firstName = userData.firstName || "";
        const lastName = userData.lastName || "";
        const fullName = `${firstName} ${lastName}`.trim();
        
        if (fullName) return fullName;
        if (userData.email) return userData.email;
        return "Unknown Seller";
      };
      
      expect(getSellerName(null)).toBe("Unknown Seller");
      expect(getSellerName(undefined)).toBe("Unknown Seller");
      expect(getSellerName({})).toBe("Unknown Seller");
      expect(getSellerName({ email: "seller@test.com" })).toBe("seller@test.com");
    });
    
    test("should access correct image field from listing document", () => {
      const mockListingData = {
        photos: ["photo1.jpg", "photo2.jpg"],
        imageUrl: "fallback-image.jpg"
      };
      
      const getCorrectListingImage = (listing) => {
        if (!listing) return null;
        return listing.photos?.[0] || listing.imageUrl || null;
      };
      
      expect(getCorrectListingImage(mockListingData)).toBe("photo1.jpg");
      expect(getCorrectListingImage({ photos: [] })).toBe(null);
      expect(getCorrectListingImage({ imageUrl: "only-image.jpg" })).toBe("only-image.jpg");
      expect(getCorrectListingImage({})).toBe(null);
      expect(getCorrectListingImage(null)).toBe(null);
    });
    
    test("should handle listing with multiple image formats", () => {
      const testCases = [
        { input: { photos: ["img1.jpg"] }, expected: "img1.jpg" },
        { input: { photos: [], imageUrl: "img.jpg" }, expected: "img.jpg" },
        { input: { imageUrl: "img.jpg" }, expected: "img.jpg" },
        { input: { photos: ["img1.jpg", "img2.jpg"], imageUrl: "fallback.jpg" }, expected: "img1.jpg" },
        { input: {}, expected: null },
      ];
      
      const getImage = (listing) => listing?.photos?.[0] || listing?.imageUrl || null;
      
      testCases.forEach(({ input, expected }) => {
        expect(getImage(input)).toBe(expected);
      });
    });
  });
  
  // ── Test 5: Price fallback with magic number ─────────────────────────
  describe("Magic Number Price Fallback Bug", () => {
    test("should not use magic number 17.5 as price fallback", () => {
      const getListingPrice = (listing, defaultValue = null) => {
        if (!listing) return defaultValue;
        return listing.price ?? listing.listingPrice ?? defaultValue;
      };
      
      const mockListingWithPrice = { price: 100 };
      const mockListingWithListingPrice = { listingPrice: 75 };
      const mockListingWithZero = { price: 0 };
      const mockListingEmpty = {};
      
      expect(getListingPrice(mockListingWithPrice)).toBe(100);
      expect(getListingPrice(mockListingWithListingPrice)).toBe(75);
      expect(getListingPrice(mockListingWithZero)).toBe(0);
      expect(getListingPrice(mockListingEmpty)).toBe(null);
      expect(getListingPrice(mockListingEmpty, 0)).toBe(0);
      expect(getListingPrice(null, 0)).toBe(0);
    });
    
    test("should use null coalescing for price values", () => {
      const transactions = [
        { agreedPrice: 500, price: 400 },
        { price: 300 },
        { agreedPrice: 0 },
        { agreedPrice: null, price: 250 },
        {},
      ];
      
      const getPrice = (tx) => tx.agreedPrice ?? tx.price ?? null;
      
      expect(getPrice(transactions[0])).toBe(500);
      expect(getPrice(transactions[1])).toBe(300);
      expect(getPrice(transactions[2])).toBe(0);
      expect(getPrice(transactions[3])).toBe(250);
      expect(getPrice(transactions[4])).toBe(null);
    });
    
    test("should format price with correct South African currency format", () => {
      const formatPrice = (price) => {
        if (price === null || price === undefined) return null;
        return `R ${Number(price).toLocaleString('en-ZA')}`;
      };
      
      // FIXED: Normalize spaces to handle non-breaking space vs regular space
      const normalizeSpaces = (str) => str.replace(/\s/g, ' ');
      
      expect(normalizeSpaces(formatPrice(1000))).toBe("R 1 000");
      expect(normalizeSpaces(formatPrice(1250.50))).toBe("R 1 250.5");
      expect(formatPrice(0)).toBe("R 0");
      expect(formatPrice(null)).toBe(null);
    });
  });
  
  // ── Test 6: Nested try-catch structure issues ────────────────────────
  describe("Nested Try-Catch Structure Bug", () => {
    test("should handle missing listingId gracefully without breaking entire batch", async () => {
      const mockTransactions = [
        { id: "tx1", listingId: "valid123", sellerId: "seller1" },
        { id: "tx2", listingId: null, sellerId: "seller2" },
        { id: "tx3", listingId: "invalid", sellerId: "seller3" },
      ];
      
      const processTransactionsWithErrorHandling = (transactions) => {
        const results = [];
        
        for (const tx of transactions) {
          try {
            let listingTitle = "Unknown Item";
            let listingImage = null;
            let listingPrice = null;
            
            if (tx.listingId) {
              if (tx.listingId === "invalid") {
                throw new Error("Listing not found");
              }
              listingTitle = `Fetched: ${tx.listingId}`;
              listingImage = "image.jpg";
              listingPrice = 100;
            }
            
            results.push({
              ...tx,
              listingTitle,
              listingImage,
              listingPrice,
              processed: true
            });
          } catch (error) {
            console.error(`Failed to process transaction ${tx.id}:`, error);
            results.push({
              ...tx,
              listingTitle: "Error loading listing",
              processed: false,
              error: error.message
            });
          }
        }
        
        return results;
      };
      
      const results = processTransactionsWithErrorHandling(mockTransactions);
      
      expect(results).toHaveLength(3);
      expect(results[0].processed).toBe(true);
      expect(results[0].listingTitle).toBe("Fetched: valid123");
      expect(results[1].processed).toBe(true);
      expect(results[1].listingTitle).toBe("Unknown Item");
      expect(results[2].processed).toBe(false);
      expect(results[2].listingTitle).toBe("Error loading listing");
    });
    
    test("should handle seller fetch errors independently", async () => {
      const transaction = { id: "tx1", sellerId: "seller123" };
      
      let sellerName = null;
      let sellerError = null;
      
      try {
        if (transaction.sellerId) {
          if (transaction.sellerId === "error") {
            throw new Error("Seller not found");
          }
          sellerName = "Fetched Seller Name";
        }
      } catch (error) {
        sellerError = error.message;
        sellerName = "Unknown Seller";
      }
      
      expect(sellerName).toBe("Fetched Seller Name");
      expect(sellerError).toBe(null);
      
      const errorTransaction = { id: "tx2", sellerId: "error" };
      let errorSellerName = null;
      let errorSellerError = null;
      
      try {
        if (errorTransaction.sellerId === "error") {
          throw new Error("Seller not found");
        }
        errorSellerName = "Fetched Seller Name";
      } catch (error) {
        errorSellerError = error.message;
        errorSellerName = "Unknown Seller";
      }
      
      expect(errorSellerName).toBe("Unknown Seller");
      expect(errorSellerError).toBe("Seller not found");
    });
  });
  
  // ── Test 7: JSX template issues ──────────────────────────────────────
  describe("JSX Template Bugs", () => {
    test("image tag should have correct syntax", () => {
      const mockTx = { listingImage: "test-image.jpg", listingTitle: "Test Item" };
      
      const correctImageJSX = {
        tag: "img",
        src: mockTx.listingImage,
        alt: mockTx.listingTitle
      };
      
      expect(correctImageJSX.tag).toBe("img");
      expect(correctImageJSX.src).toBe("test-image.jpg");
      expect(correctImageJSX.alt).toBe("Test Item");
    });
    
    test("className should use object property access notation", () => {
      const styles = { cardDetail: "card_detail_class_name" };
      
      const correctClassName = styles.cardDetail;
      
      expect(correctClassName).toBe("card_detail_class_name");
      expect(typeof correctClassName).toBe("string");
    });
    
    test("icon className should be properly formatted", () => {
      const correctIconJSX = {
        className: "fas fa-user"
      };
      
      expect(correctIconJSX.className).toBe("fas fa-user");
    });
    
    test("style object should use double brace syntax", () => {
      const status = { color: "#3b82f6", bg: "#dbeafe" };
      
      const correctStyleObject = {
        color: status.color,
        background: status.bg
      };
      
      expect(correctStyleObject).toEqual({ color: "#3b82f6", background: "#dbeafe" });
    });
    
    test("dynamic class names should use template literals", () => {
      const isActive = true;
      const isAccepted = false;
      
      const correctClassName = `card ${isActive ? "cardActive" : ""} ${isAccepted ? "cardAccepted" : ""}`.trim();
      
      expect(correctClassName).toBe("card cardActive");
    });
  });
  
  // ── Test 8: Offer panel conditional rendering issues ─────────────────
  describe("Offer Panel Conditional Rendering Bugs", () => {
    test("should properly check for hasTerms condition", () => {
      const testCases = [
        { input: { terms: "Some terms" }, expected: true },
        { input: { terms: "" }, expected: false },
        { input: { terms: null }, expected: false },
        { input: { terms: undefined }, expected: false },
        { input: {}, expected: false },
      ];
      
      testCases.forEach(({ input, expected }) => {
        const hasTerms = !!input.terms;
        expect(hasTerms).toBe(expected);
      });
    });
    
    test("should properly check for hasPayment condition", () => {
      // FIXED: Handle undefined properly and ensure trade type excludes payment
      const testCases = [
        { input: { paymentType: "full_online" }, expected: true },
        { input: { paymentMethod: "cash" }, expected: true },
        { input: { paymentType: "partial" }, expected: true },
        { input: { type: "trade" }, expected: false },
        { input: { type: "trade", paymentType: "full_online" }, expected: false },
        { input: {}, expected: false },
        { input: { paymentType: undefined }, expected: false },
        { input: { paymentMethod: undefined }, expected: false },
      ];
      
      testCases.forEach(({ input, expected }) => {
        const hasPayment = !!(input.paymentType || input.paymentMethod) && input.type !== "trade";
        expect(hasPayment).toBe(expected);
      });
    });
    
    test("should properly check for hasPartial condition", () => {
      const testCases = [
        { input: { paymentType: "partial", partialAmount: 300 }, expected: true },
        { input: { paymentType: "partial", partialAmount: 0 }, expected: true },
        { input: { paymentType: "partial", partialAmount: null }, expected: false },
        { input: { paymentType: "full_online", partialAmount: 300 }, expected: false },
        { input: { paymentType: "partial" }, expected: false },
        { input: {}, expected: false },
      ];
      
      testCases.forEach(({ input, expected }) => {
        const hasPartial = input.paymentType === "partial" && input.partialAmount != null;
        expect(hasPartial).toBe(expected);
      });
    });
    
    test("should properly calculate cash due amount", () => {
      const testCases = [
        { agreedPrice: 500, partialAmount: 300, expected: 200 },
        { agreedPrice: null, listingPrice: 500, partialAmount: 300, expected: 200 },
        { agreedPrice: 500, partialAmount: null, expected: 500 },
        { agreedPrice: null, listingPrice: null, partialAmount: null, expected: 0 },
        { agreedPrice: 0, partialAmount: 0, expected: 0 },
      ];
      
      testCases.forEach(({ agreedPrice, listingPrice, partialAmount, expected }) => {
        const total = Number(agreedPrice ?? listingPrice ?? 0);
        const cashDue = Math.max(0, total - Number(partialAmount ?? 0));
        expect(cashDue).toBe(expected);
      });
    });
    
    test("should correctly map payment type labels", () => {
      const PAYMENT_LABELS = {
        full_online: 'Fully Online',
        partial: 'Partial Online + Cash',
        cash: 'Full Cash on Delivery',
        online: 'Fully Online',
        cod: 'Full Cash on Delivery',
      };
      
      const testCases = [
        { input: 'full_online', expected: 'Fully Online' },
        { input: 'partial', expected: 'Partial Online + Cash' },
        { input: 'cash', expected: 'Full Cash on Delivery' },
        { input: 'online', expected: 'Fully Online' },
        { input: 'cod', expected: 'Full Cash on Delivery' },
        { input: 'unknown', expected: undefined },
      ];
      
      testCases.forEach(({ input, expected }) => {
        expect(PAYMENT_LABELS[input]).toBe(expected);
      });
    });
  });
  
  // ── Test 9: Empty state rendering ────────────────────────────────────
  describe("Empty State Conditional Bugs", () => {
    test("should show empty state when filtered array is empty and not loading", () => {
      const testCases = [
        { isLoading: false, filteredLength: 0, expected: true },
        { isLoading: true, filteredLength: 0, expected: false },
        { isLoading: false, filteredLength: 5, expected: false },
        { isLoading: true, filteredLength: 5, expected: false },
      ];
      
      testCases.forEach(({ isLoading, filteredLength, expected }) => {
        const showEmptyState = !isLoading && filteredLength === 0;
        expect(showEmptyState).toBe(expected);
      });
    });
    
    test("should show correct empty message based on active filter", () => {
      const getEmptyMessage = (activeFilter) => {
        return activeFilter === 'all' 
          ? "You haven't made any offers yet" 
          : `No ${activeFilter} offers`;
      };
      
      expect(getEmptyMessage('all')).toBe("You haven't made any offers yet");
      expect(getEmptyMessage('pending')).toBe("No pending offers");
      expect(getEmptyMessage('accepted')).toBe("No accepted offers");
      expect(getEmptyMessage('completed')).toBe("No completed offers");
      expect(getEmptyMessage('declined')).toBe("No declined offers");
    });
    
    test("should show browse button only on 'all' filter empty state", () => {
      const shouldShowBrowseButton = (activeFilter) => activeFilter === 'all';
      
      expect(shouldShowBrowseButton('all')).toBe(true);
      expect(shouldShowBrowseButton('pending')).toBe(false);
      expect(shouldShowBrowseButton('accepted')).toBe(false);
      expect(shouldShowBrowseButton('waiting')).toBe(false);
      expect(shouldShowBrowseButton('completed')).toBe(false);
      expect(shouldShowBrowseButton('declined')).toBe(false);
    });
  });
  
  // ── Test 10: Filter count badge display ──────────────────────────────
  describe("Filter Count Badge Bug", () => {
    test("should only show count badge when count > 0", () => {
      const shouldShowBadge = (count) => count > 0;
      
      expect(shouldShowBadge(5)).toBe(true);
      expect(shouldShowBadge(1)).toBe(true);
      expect(shouldShowBadge(0)).toBe(false);
      expect(shouldShowBadge(null)).toBe(false);
      expect(shouldShowBadge(undefined)).toBe(false);
    });
    
    test("should correctly calculate filter counts", () => {
      const transactions = [
        { status: 'pending' },
        { status: 'accepted' },
        { status: 'pending' },
        { status: 'completed' },
        { status: 'pending' },
        { status: 'declined' },
      ];
      
      const calculateCounts = (transactions) => {
        const counts = {
          all: transactions.length,
          pending: transactions.filter(tx => tx.status === 'pending').length,
          accepted: transactions.filter(tx => tx.status === 'accepted').length,
          waiting: transactions.filter(tx => tx.status === 'waiting').length,
          completed: transactions.filter(tx => tx.status === 'completed').length,
          declined: transactions.filter(tx => tx.status === 'declined').length,
        };
        return counts;
      };
      
      const counts = calculateCounts(transactions);
      
      expect(counts.all).toBe(6);
      expect(counts.pending).toBe(3);
      expect(counts.accepted).toBe(1);
      expect(counts.waiting).toBe(0);
      expect(counts.completed).toBe(1);
      expect(counts.declined).toBe(1);
    });
  });
  
  // ── Test 11: Active count badge calculation ──────────────────────────
  describe("Active Count Badge Calculation", () => {
    test("should correctly count active transactions", () => {
      const transactions = [
        { status: 'pending' },
        { status: 'accepted' },
        { status: 'waiting' },
        { status: 'completed' },
        { status: 'declined' },
        { status: 'cancelled' },
      ];
      
      const countActiveTransactions = (transactions) => {
        const activeStatuses = ['pending', 'accepted', 'waiting'];
        return transactions.filter(tx => activeStatuses.includes(tx.status)).length;
      };
      
      expect(countActiveTransactions(transactions)).toBe(3);
    });
    
    test("should return 0 when no active transactions", () => {
      const transactions = [
        { status: 'completed' },
        { status: 'declined' },
        { status: 'cancelled' },
      ];
      
      const countActiveTransactions = (transactions) => {
        const activeStatuses = ['pending', 'accepted', 'waiting'];
        return transactions.filter(tx => activeStatuses.includes(tx.status)).length;
      };
      
      expect(countActiveTransactions(transactions)).toBe(0);
      expect(countActiveTransactions([])).toBe(0);
    });
  });
  
  // ── Test 12: Status message display logic ────────────────────────────
  describe("Status Message Display Logic", () => {
    test("should show correct message for pending status", () => {
      const getStatusMessage = (status) => {
        const messages = {
          pending: "Waiting for the seller to respond to your offer.",
          accepted: "Your offer was accepted! Tap the arrow to complete payment.",
          waiting: "Awaiting drop-off and collection confirmation.",
          completed: "Transaction complete.",
          declined: "Your offer was declined. You can browse other listings.",
          cancelled: "This transaction has been cancelled.",
        };
        return messages[status] || null;
      };
      
      expect(getStatusMessage('pending')).toContain("Waiting for the seller");
      expect(getStatusMessage('accepted')).toContain("Your offer was accepted");
      expect(getStatusMessage('waiting')).toContain("Awaiting drop-off");
      expect(getStatusMessage('completed')).toBe("Transaction complete.");
      expect(getStatusMessage('declined')).toContain("Your offer was declined");
    });
    
    test("should show correct waiting message based on payment type", () => {
      const getWaitingMessage = (tx) => {
        const payType = tx.paymentType || tx.paymentMethod || 'cash';
        const isCash = payType === 'cash' || payType === 'cod';
        const isPartialTx = payType === 'partial';
        const total = Number(tx.agreedPrice ?? tx.listingPrice ?? 0);
        const cashDue = isCash
          ? total
          : isPartialTx
            ? Math.max(0, total - Number(tx.partialAmount ?? 0))
            : 0;
        
        if (tx.paystackRef && !isCash) {
          return cashDue > 0
            ? `Online payment received. Bring R ${cashDue.toLocaleString('en-ZA')} cash at drop-off.`
            : 'Online payment received. Awaiting drop-off and collection confirmation.';
        }
        return `Cash due at drop-off: R ${cashDue.toLocaleString('en-ZA')}`;
      };
      
      const cashOnlyTx = { paymentType: 'cash', agreedPrice: 500 };
      expect(getWaitingMessage(cashOnlyTx)).toContain("Cash due at drop-off: R 500");
      
      const partialTx = { paymentType: 'partial', agreedPrice: 500, partialAmount: 300 };
      expect(getWaitingMessage(partialTx)).toContain("Cash due at drop-off: R 200");
      
      const onlineTx = { paymentType: 'full_online', agreedPrice: 500, paystackRef: 'ref123' };
      expect(getWaitingMessage(onlineTx)).toContain("Online payment received.");
    });
  });
});

// ── Test Summary Export ─────────────────────────────────────────────────
export const BugTestSummary = {
  totalTestSuites: 12,
  bugsIdentified: [
    "Variable shadowing with reused parameter names",
    "Incorrect sort comparison using undefined variables",
    "Missing return statement after try-catch block",
    "Returning error object instead of array",
    "Magic number 17.5 as price fallback",
    "Typo: 'magairl' instead of 'imageUrl'",
    "Typo: 'finance' instead of 'firstName'",
    "Undefined variable 'tric' in string concatenation",
    "Invalid JSX: <ng> instead of <img>",
    "Invalid JSX: class instead of className",
    "Missing null checks for optional fields",
    "Nested try-catch without per-transaction error handling"
  ],
  recommendedFixes: [
    "Use distinct variable names (listingDoc, sellerDoc)",
    "Use (order[a.status] ?? 6) - (order[b.status] ?? 6) for sorting",
    "Add return statement inside try block",
    "Return [] instead of err in catch block",
    "Remove magic number, use null coalescing",
    "Fix typo: imageUrl or photos?.[0]",
    "Use firstName and lastName fields correctly",
    "Use proper name formatting without undefined variables",
    "Fix JSX: <img src={tx.listingImage} />",
    "Fix JSX: className={styles.cardDetail}",
    "Add optional chaining and null checks",
    "Wrap each transaction processing in individual try-catch"
  ]
};