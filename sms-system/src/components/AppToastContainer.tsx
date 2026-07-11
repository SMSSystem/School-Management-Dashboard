import { ToastContainer } from "react-toastify";
import { useIsDark } from "@/lib/useTheme";

const AppToastContainer = () => {
  const isDark = useIsDark();

  return (
    <ToastContainer
      position="top-right"
      autoClose={4000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      pauseOnFocusLoss
      pauseOnHover
      theme={isDark ? "dark" : "light"}
    />
  );
};

export default AppToastContainer;
