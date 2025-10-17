import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageCircle, Phone, User, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useUserRole } from "@/hooks/useUserRole";

interface WhatsAppRequest {
  id: string;
  full_name: string;
  phone: string;
  wants_whatsapp_group: boolean;
  created_at: string;
}

const WhatsAppRequests = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: userRole } = useUserRole();
  const [requests, setRequests] = useState<WhatsAppRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is admin
    if (userRole && userRole.role !== 'admin') {
      toast({
        variant: "destructive",
        title: "Acesso negado",
        description: "Apenas administradores podem acessar esta página.",
      });
      navigate("/");
      return;
    }

    if (userRole) {
      loadRequests();
    }
  }, [userRole, navigate, toast]);

  const loadRequests = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone, wants_whatsapp_group, created_at")
      .eq("wants_whatsapp_group", true)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível carregar as solicitações.",
      });
    } else {
      setRequests(data || []);
    }

    setLoading(false);
  };

  const formatPhone = (phone: string) => {
    // Remove non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Format as (XX) XXXXX-XXXX or (XX) XXXX-XXXX
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return phone;
  };

  const openWhatsApp = (phone: string) => {
    // Remove non-digits and add country code if not present
    const digits = phone.replace(/\D/g, '');
    const phoneWithCountry = digits.startsWith('55') ? digits : `55${digits}`;
    
    window.open(`https://wa.me/${phoneWithCountry}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background p-4">
      <div className="max-w-4xl mx-auto pt-8 pb-16 space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-primary" />
              Solicitações para Grupo do WhatsApp
            </CardTitle>
            <CardDescription>
              Usuários que querem participar do grupo do WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <div className="text-center py-8">
                <XCircle className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  Nenhuma solicitação encontrada.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((request) => (
                  <Card key={request.id} className="border-2 hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-semibold">{request.full_name}</span>
                            <Badge variant="secondary" className="ml-2">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Quer participar
                            </Badge>
                          </div>
                          
                          {request.phone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="w-4 h-4" />
                              <span>{formatPhone(request.phone)}</span>
                            </div>
                          )}
                          
                          <div className="text-xs text-muted-foreground">
                            Solicitado em: {new Date(request.created_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                        
                        {request.phone && (
                          <Button
                            onClick={() => openWhatsApp(request.phone)}
                            className="flex-shrink-0"
                          >
                            <MessageCircle className="w-4 h-4 mr-2" />
                            Abrir WhatsApp
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WhatsAppRequests;
