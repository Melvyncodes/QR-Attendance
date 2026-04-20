import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox } from "react-native";
import { UserProvider } from "../context/UserContext";

LogBox.ignoreLogs([
  "Missing or insufficient permissions",
  "@firebase/firestore",
  "Unable to activate keep awake",
]);

export default function RootLayout() {
  
  return (
    <UserProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />

        {/* Auth Screens */}
        <Stack.Screen name="screens/auth/LoginScreen" />
        <Stack.Screen
          name="screens/auth/RegisterStudent"
          options={{
            headerShown: true,
            title: "Student Registration",
            headerStyle: { backgroundColor: "#2C3E7A" },
            headerTintColor: "#fff",
          }}
        />
        <Stack.Screen
          name="screens/auth/RegisterLecturer"
          options={{
            headerShown: true,
            title: "Lecturer Registration",
            headerStyle: { backgroundColor: "#2C3E7A" },
            headerTintColor: "#fff",
          }}
        />
        <Stack.Screen
          name="screens/auth/RegisterAdmin"
          options={{
            headerShown: true,
            title: "Admin Registration",
            headerStyle: { backgroundColor: "#2C3E7A" },
            headerTintColor: "#fff",
          }}
        />

        {/* Admin Screens */}
        <Stack.Screen name="screens/admin/Dashboard" />
        <Stack.Screen
          name="screens/admin/ManageUsers"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin/ManageCourses"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin/Profile"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin/Reports"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="screens/admin/Notifications"
          options={{ headerShown: false }}
        />

        {/* Lecturer Screens */}
        <Stack.Screen name="screens/lecturer/Dashboard" />
        <Stack.Screen name="screens/lecturer/MyCourses" />
        <Stack.Screen name="screens/lecturer/CreateCourse" />
        <Stack.Screen name="screens/lecturer/Attendance" />
        <Stack.Screen name="screens/lecturer/AttendanceSession" />
        <Stack.Screen name="screens/lecturer/ActiveSession" />
        <Stack.Screen name="screens/lecturer/Reports" />
        <Stack.Screen name="screens/lecturer/Notifications" />
        <Stack.Screen name="screens/lecturer/Profile" />

        {/* Student Screens */}
        <Stack.Screen name="screens/student/Dashboard" />
        <Stack.Screen name="screens/student/MyCourses" />
        <Stack.Screen name="screens/student/SearchCourse" />
        <Stack.Screen name="screens/student/MyAttendance" />
        <Stack.Screen name="screens/student/Notifications" />
        <Stack.Screen name="screens/student/Profile" />
        <Stack.Screen name="screens/student/ScanQR" />
      </Stack>
      <StatusBar style="auto" />
    </UserProvider>
  );
}
