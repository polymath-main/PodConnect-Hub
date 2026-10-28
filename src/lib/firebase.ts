import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  setDoc,
  getDocs,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Client, Lead, Milestone } from '../types';

// Reuse existing Firebase app or initialize
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
const firestoreDbId = (firebaseConfig as Record<string, any>).firestoreDatabaseId || 'ai-studio-podconnecthubai-7d333a90-2680-4b44-b986-0aad5551056d';
export const db = getFirestore(app, firestoreDbId);

// Validate Connection to Firestore safely without throwing unhandled exceptions
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch {
    // Gracefully ignore initial or offline check notices
  }
}
testConnection();

// Standard Error Handling conforming to FirestoreErrorInfo
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Configure Google Auth Provider with standard profile and email scopes
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
provider.addScope('email');
provider.addScope('profile');
provider.addScope('openid');

// In-memory token cache (NEVER stored in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Initialize auth state listener with automatic token restoration across page refreshes
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      try {
        const idToken = await user.getIdToken();
        cachedAccessToken = cachedAccessToken || idToken;
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } catch (err) {
        console.warn('Failed to resolve Firebase ID token:', err);
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken || '');
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Must be called from a user interaction (button click)
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    // Use Google OAuth accessToken if returned, or fallback to standard Firebase ID token
    const idToken = await result.user.getIdToken();
    cachedAccessToken = credential?.accessToken || idToken;

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    // If the user cancelled or closed the popup window, handle it cleanly without error
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request' ||
      error?.message?.includes('popup-closed-by-user') ||
      error?.message?.includes('cancelled-popup-request')
    ) {
      return null;
    }

    // Friendly diagnostic for unauthorized domains
    if (error?.code === 'auth/unauthorized-domain') {
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'current domain';
      throw new Error(
        `Domain "${currentHost}" is not authorized in Firebase Console. Add it in Firebase Console > Authentication > Settings > Authorized domains, or use Quick Operator access.`
      );
    }

    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Quick Operator / Demo Authentication Fallback
export const operatorSignIn = async (
  email: string = 'operator@podconnect.agency'
): Promise<{ user: { uid: string; email: string; displayName: string; photoURL?: string }; accessToken: string }> => {
  const mockUser = {
    uid: 'operator_system',
    email: email,
    displayName: 'Lead Agency Operator',
  };
  cachedAccessToken = 'operator_system_token';
  return { user: mockUser, accessToken: cachedAccessToken };
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setAccessTokenInMemory = (token: string | null) => {
  cachedAccessToken = token;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// --- Cloud Firestore Persistence Helpers ---

export async function saveClientToFirestore(client: Client, userId: string): Promise<void> {
  const path = `clients/${client.id}`;
  try {
    const payload = {
      id: client.id,
      name: client.name.slice(0, 100),
      platform: client.platform.slice(0, 50),
      niche: client.niche.slice(0, 100),
      package: client.package.slice(0, 100),
      pricing: client.pricing ? client.pricing.slice(0, 50) : '',
      timelineStart: client.startDate || '',
      timelineEnd: client.endDate || '',
      stage: client.stage || 'Onboarding',
      status: client.status === 'Review' ? 'Active' : client.status,
      orderNumber: client.orderNumber || `ORD-2026-${client.id}`,
      targetPlacements: client.targetPlacements || 10,
      bookedPlacements: client.bookedPlacements || 0,
      cancellationDetails: client.cancellationDetails || null,
      stageHistory: client.stageHistory || [],
      conversationDocUrl: client.docs.conversationExportUrl || '',
      requirementsDocUrl: client.docs.requirementsDocUrl || '',
      outreachStrategyDocUrl: client.docs.outreachStrategyDocUrl || '',
      masterSheetUrl: '',
      userId: userId,
      createdAt: client.startDate || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      minSubscribers: client.minSubscribers || 1000,
      contractDays: client.contractDays || 120,
      messagePillars: client.messagePillars || [],
      credibilityAssets: client.credibilityAssets || [],
      samplePitchAngle: client.samplePitchAngle || '',
      milestones: client.milestones || [],
      docs: client.docs || {},
    };
    await setDoc(doc(db, 'clients', client.id), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchClientsFromFirestore(userId: string): Promise<Client[]> {
  const path = 'clients';
  try {
    const q = query(collection(db, path), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const clients: Client[] = [];
    snapshot.forEach((d) => {
      const data = d.data() as any;
      clients.push({
        id: data.id || d.id,
        name: data.name,
        platform: data.platform,
        niche: data.niche,
        package: data.package,
        pricing: data.pricing,
        minSubscribers: data.minSubscribers || 1000,
        contractDays: data.contractDays || 120,
        startDate: data.timelineStart || data.startDate || '2026-10-24',
        endDate: data.timelineEnd || data.endDate || '2027-02-21',
        stage: data.stage || 'Onboarding',
        status: data.status || 'Active',
        orderNumber: data.orderNumber || `ORD-2026-${data.id || d.id}`,
        targetPlacements: data.targetPlacements || 10,
        bookedPlacements: data.bookedPlacements || 0,
        cancellationDetails: data.cancellationDetails || undefined,
        stageHistory: data.stageHistory || [],
        messagePillars: data.messagePillars || [],
        credibilityAssets: data.credibilityAssets || [],
        samplePitchAngle: data.samplePitchAngle || '',
        milestones: data.milestones || [],
        docs: data.docs || {
          conversationExportUrl: data.conversationDocUrl,
          requirementsDocUrl: data.requirementsDocUrl,
          outreachStrategyDocUrl: data.outreachStrategyDocUrl,
        },
        lastSyncedAt: data.updatedAt || new Date().toISOString(),
      });
    });
    return clients;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function saveLeadToFirestore(lead: Lead, userId: string): Promise<void> {
  const docId = `lead_${lead.id}`;
  const path = `leads/${docId}`;
  try {
    const payload = {
      id: docId,
      clientId: lead.clientId,
      showName: lead.showName.slice(0, 200),
      hostName: (lead.hostName || 'Host').slice(0, 100),
      platform: lead.platform.slice(0, 50),
      showUrl: lead.showUrl ? lead.showUrl.slice(0, 500) : '',
      email: lead.email ? lead.email.slice(0, 150) : '',
      subscribers: Number(lead.subscribers) || 0,
      niche: lead.niche.slice(0, 100),
      score: Number(lead.score) || 0,
      tags: lead.tags || [],
      notes: lead.notes ? lead.notes.slice(0, 500) : '',
      location: lead.location ? lead.location.slice(0, 100) : '',
      status: lead.status === 'Dispatched' ? 'Sent' : lead.status === 'Passed' ? 'New' : lead.status,
      dateAdded: lead.dateAdded || new Date().toISOString(),
      userId: userId,
    };
    await setDoc(doc(db, 'leads', docId), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

