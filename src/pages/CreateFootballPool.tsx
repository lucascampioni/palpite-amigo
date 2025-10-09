import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Match {
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  championship: string;
}

const CreateFootballPool = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<Match[]>([
    { homeTeam: "", awayTeam: "", matchDate: "", championship: "brasileirao-serie-a" }
  ]);

  const handleAddMatch = () => {
    setMatches([...matches, { homeTeam: "", awayTeam: "", matchDate: "", championship: "brasileirao-serie-a" }]);
  };

  const handleRemoveMatch = (index: number) => {
    setMatches(matches.filter((_, i) => i !== index));
  };

  const handleMatchChange = (index: number, field: keyof Match, value: string) => {
    const newMatches = [...matches];
    newMatches[index][field] = value;
    setMatches(newMatches);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const deadline = formData.get("deadline") as string;
    const pixKey = formData.get("pix_key") as string;

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Você precisa estar logado para criar um bolão.",
      });
      setLoading(false);
      return;
    }

    // Validate matches
    const validMatches = matches.filter(m => m.homeTeam && m.awayTeam && m.matchDate);
    if (validMatches.length === 0) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Adicione pelo menos um jogo ao bolão.",
      });
      setLoading(false);
      return;
    }

    // Create pool
    const { data: pool, error: poolError } = await supabase
      .from("pools")
      .insert([{
        owner_id: user.id,
        title,
        description,
        guess_label: "Palpite dos placares",
        measurement_unit: "score" as any,
        deadline: new Date(deadline).toISOString(),
        status: "active" as any,
        pool_type: "football" as any,
        pix_key: pixKey || null,
      }])
      .select()
      .single();

    if (poolError || !pool) {
      toast({
        variant: "destructive",
        title: "Erro ao criar bolão",
        description: poolError?.message,
      });
      setLoading(false);
      return;
    }

    // Create matches
    const matchesData = validMatches.map(match => ({
      pool_id: pool.id,
      home_team: match.homeTeam,
      away_team: match.awayTeam,
      match_date: new Date(match.matchDate).toISOString(),
      championship: match.championship,
      status: "scheduled",
    }));

    const { error: matchesError } = await supabase
      .from("football_matches")
      .insert(matchesData);

    if (matchesError) {
      toast({
        variant: "destructive",
        title: "Erro ao criar jogos",
        description: matchesError.message,
      });
      // Delete the pool if matches creation failed
      await supabase.from("pools").delete().eq("id", pool.id);
    } else {
      toast({
        title: "Bolão de futebol criado!",
        description: "Seu bolão foi criado com sucesso.",
      });
      navigate(`/pool/${pool.id}`);
    }

    setLoading(false);
  };

  const championships = [
    { value: "brasileirao-serie-a", label: "Brasileirão Série A" },
    { value: "brasileirao-serie-b", label: "Brasileirão Série B" },
    { value: "copa-do-brasil", label: "Copa do Brasil" },
    { value: "libertadores", label: "Libertadores" },
    { value: "champions-league", label: "Champions League" },
    { value: "premier-league", label: "Premier League" },
    { value: "la-liga", label: "La Liga" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background p-4">
      <div className="max-w-2xl mx-auto pt-8 pb-16">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl flex items-center gap-2">
              ⚽ Criar Bolão de Futebol
            </CardTitle>
            <CardDescription>
              Configure seu bolão de jogos de futebol
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Título do Bolão *</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Ex: Brasileirão 2025 - Rodada 10"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição *</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Descreva o bolão, regras de pontuação, etc."
                  rows={4}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline">Prazo Final para Palpites *</Label>
                <Input
                  id="deadline"
                  name="deadline"
                  type="datetime-local"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pix_key">Chave PIX (opcional)</Label>
                <Input
                  id="pix_key"
                  name="pix_key"
                  placeholder="Digite sua chave PIX para receber pagamentos"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-lg">Jogos do Bolão</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddMatch}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Jogo
                  </Button>
                </div>

                {matches.map((match, index) => (
                  <Card key={index} className="relative">
                    <CardContent className="pt-6 space-y-4">
                      {matches.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2"
                          onClick={() => handleRemoveMatch(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}

                      <div className="space-y-2">
                        <Label>Campeonato</Label>
                        <Select
                          value={match.championship}
                          onValueChange={(value) => handleMatchChange(index, "championship", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {championships.map(champ => (
                              <SelectItem key={champ.value} value={champ.value}>
                                {champ.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Time da Casa *</Label>
                          <Input
                            value={match.homeTeam}
                            onChange={(e) => handleMatchChange(index, "homeTeam", e.target.value)}
                            placeholder="Ex: Flamengo"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Time Visitante *</Label>
                          <Input
                            value={match.awayTeam}
                            onChange={(e) => handleMatchChange(index, "awayTeam", e.target.value)}
                            placeholder="Ex: Palmeiras"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Data e Hora do Jogo *</Label>
                        <Input
                          type="datetime-local"
                          value={match.matchDate}
                          onChange={(e) => handleMatchChange(index, "matchDate", e.target.value)}
                          required
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="bg-muted/50 p-4 rounded-lg text-sm space-y-2">
                <p className="font-semibold">📊 Sistema de Pontuação:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li><strong>5 pontos</strong>: Placar exato</li>
                  <li><strong>3 pontos</strong>: Resultado correto (vitória, empate ou derrota)</li>
                  <li><strong>1 ponto</strong>: Diferença de gols correta</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/")}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? "Criando..." : "Criar Bolão"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreateFootballPool;
