import { Redirect } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { auth, db } from "../firebase";
import {
  checkSessionTimeout,
  clearInactivityTimer,
  resetInactivityTimer,
  startInactivityTimer,
} from "../sessionManager";

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    // Check session timeout when app opens
    checkSessionTimeout();

    // Listen for app state changes (background/foreground)
    const appStateListener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkSessionTimeout();
        resetInactivityTimer();
      }
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setRole(docSnap.data().role);
        }
        setLoggedIn(true);
        startInactivityTimer();
      } else {
        setLoggedIn(false);
        clearInactivityTimer();
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      appStateListener.remove();
    };
  }, []);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#F5F6FA",
        }}
      >
        <ActivityIndicator size="large" color="#2C3E7A" />
      </View>
    );
  }

  if (!loggedIn) return <Redirect href={"/screens/auth/LoginScreen" as any} />;
  if (role === "admin")
    return <Redirect href={"/screens/admin/Dashboard" as any} />;
  if (role === "lecturer")
    return <Redirect href={"/screens/lecturer/Dashboard" as any} />;
  if (role === "student")
    return <Redirect href={"/screens/student/Dashboard" as any} />;

  return <Redirect href={"/screens/auth/LoginScreen" as any} />;
}
