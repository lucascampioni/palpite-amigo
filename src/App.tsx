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
import WhatsAppVerification from "./pages/WhatsAppVerification";
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
          <Route path="/entrar" element={<Auth />} />
          <Route path="/confirmar-email" element={<EmailConfirmation />} />
          <Route path="/redefinir-senha" element={<ResetPassword />} />
          <Route path="/criar-bolao" element={<CreateFootballPool />} />
          <Route path="/editar-bolao/:id" element={<EditFootballPool />} />
          <Route path="/bolao/:slug" element={<PoolDetail />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/privacidade" element={<Privacy />} />
          <Route path="/solicitacoes-whatsapp" element={<WhatsAppRequests />} />
          <Route path="/verificacao-whatsapp" element={<WhatsAppVerification />} />
          {/* Backward compatibility redirects for old URLs */}
          <Route path="/auth" element={<Auth />} />
          <Route path="/pool/:slug" element={<PoolDetail />} />
          <Route path="/edit-pool/:id" element={<EditFootballPool />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/create-football" element={<CreateFootballPool />} />
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
