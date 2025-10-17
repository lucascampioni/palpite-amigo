import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import CreateFootballPool from "./pages/CreateFootballPool";
import EditFootballPool from "./pages/EditFootballPool";
import PoolDetail from "./pages/PoolDetail";
import Profile from "./pages/Profile";
import Privacy from "./pages/Privacy";
import EmailConfirmation from "./pages/EmailConfirmation";
import ResetPassword from "./pages/ResetPassword";
import WhatsAppRequests from "./pages/WhatsAppRequests";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/email-confirmation" element={<EmailConfirmation />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/create-football" element={<CreateFootballPool />} />
          <Route path="/edit-pool/:id" element={<EditFootballPool />} />
          <Route path="/pool/:id" element={<PoolDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/whatsapp-requests" element={<WhatsAppRequests />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
