import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";

const Index = lazy(() => import("./pages/Index"));
const Landing = lazy(() => import("./pages/Landing"));
const Terms = lazy(() => import("./pages/Terms"));
const Auth = lazy(() => import("./pages/Auth"));
const CreateFootballPool = lazy(() => import("./pages/CreateFootballPool"));
const EditFootballPool = lazy(() => import("./pages/EditFootballPool"));
const PoolDetail = lazy(() => import("./pages/PoolDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const Privacy = lazy(() => import("./pages/Privacy"));
const EmailConfirmation = lazy(() => import("./pages/EmailConfirmation"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const WhatsAppRequests = lazy(() => import("./pages/WhatsAppRequests"));
const SmsVerification = lazy(() => import("./pages/SmsVerification"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Communities = lazy(() => import("./pages/Communities"));
const CommunityDetail = lazy(() => import("./pages/CommunityDetail"));
const Support = lazy(() => import("./pages/Support"));
const PartnerRedirect = lazy(() => import("./pages/PartnerRedirect"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/termos-de-uso" element={<Terms />} />
            <Route path="/politica-de-privacidade" element={<Privacy />} />
            <Route path="/entrar" element={<Auth />} />
            <Route path="/confirmar-email" element={<EmailConfirmation />} />
            <Route path="/redefinir-senha" element={<ResetPassword />} />
            <Route path="/privacidade" element={<Privacy />} />
            <Route path="/verificacao-sms" element={<SmsVerification />} />
            <Route path="/verificacao-whatsapp" element={<SmsVerification />} />
            <Route path="/ajuda" element={<Support />} />
            <Route path="/p/:slug" element={<PartnerRedirect />} />

            {/* Protected routes */}
            <Route path="/app" element={<ProtectedRoute><Index /></ProtectedRoute>} />
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
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
