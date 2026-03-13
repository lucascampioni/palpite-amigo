import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
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
import SmsVerification from "./pages/SmsVerification";
import NotFound from "./pages/NotFound";
import Communities from "./pages/Communities";
import CommunityDetail from "./pages/CommunityDetail";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/entrar" element={<Auth />} />
          <Route path="/confirmar-email" element={<EmailConfirmation />} />
          <Route path="/redefinir-senha" element={<ResetPassword />} />
          <Route path="/privacidade" element={<Privacy />} />
          <Route path="/verificacao-sms" element={<SmsVerification />} />
          <Route path="/verificacao-whatsapp" element={<SmsVerification />} />

          {/* Protected routes */}
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/criar-bolao" element={<ProtectedRoute><CreateFootballPool /></ProtectedRoute>} />
          <Route path="/editar-bolao/:id" element={<ProtectedRoute><EditFootballPool /></ProtectedRoute>} />
          <Route path="/bolao/:slug" element={<ProtectedRoute><PoolDetail /></ProtectedRoute>} />
          <Route path="/perfil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/solicitacoes-whatsapp" element={<ProtectedRoute><WhatsAppRequests /></ProtectedRoute>} />
          <Route path="/comunidades" element={<ProtectedRoute><Communities /></ProtectedRoute>} />
          <Route path="/comunidade/:slug" element={<ProtectedRoute><CommunityDetail /></ProtectedRoute>} />

          {/* Backward compatibility redirects for old URLs */}
          <Route path="/auth" element={<Auth />} />
          <Route path="/pool/:slug" element={<ProtectedRoute><PoolDetail /></ProtectedRoute>} />
          <Route path="/edit-pool/:id" element={<ProtectedRoute><EditFootballPool /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/create-football" element={<ProtectedRoute><CreateFootballPool /></ProtectedRoute>} />
          <Route path="/email-confirmation" element={<EmailConfirmation />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
