export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      football_matches: {
        Row: {
          away_score: number | null
          away_team: string
          away_team_crest: string | null
          championship: string
          created_at: string
          external_id: string | null
          external_source: string | null
          home_score: number | null
          home_team: string
          home_team_crest: string | null
          id: string
          last_sync_at: string | null
          match_date: string
          pool_id: string
          status: string
          updated_at: string
        }
        Insert: {
          away_score?: number | null
          away_team: string
          away_team_crest?: string | null
          championship: string
          created_at?: string
          external_id?: string | null
          external_source?: string | null
          home_score?: number | null
          home_team: string
          home_team_crest?: string | null
          id?: string
          last_sync_at?: string | null
          match_date: string
          pool_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          away_score?: number | null
          away_team?: string
          away_team_crest?: string | null
          championship?: string
          created_at?: string
          external_id?: string | null
          external_source?: string | null
          home_score?: number | null
          home_team?: string
          home_team_crest?: string | null
          id?: string
          last_sync_at?: string | null
          match_date?: string
          pool_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "football_matches_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      football_predictions: {
        Row: {
          away_score_prediction: number
          created_at: string
          home_score_prediction: number
          id: string
          match_id: string
          participant_id: string
          points_earned: number | null
          updated_at: string
        }
        Insert: {
          away_score_prediction: number
          created_at?: string
          home_score_prediction: number
          id?: string
          match_id: string
          participant_id: string
          points_earned?: number | null
          updated_at?: string
        }
        Update: {
          away_score_prediction?: number
          created_at?: string
          home_score_prediction?: number
          id?: string
          match_id?: string
          participant_id?: string
          points_earned?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "football_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "football_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "football_predictions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          created_at: string
          guess_value: string
          id: string
          participant_name: string
          participant_pix_key: string | null
          payment_proof: string | null
          pix_consent: boolean | null
          pix_key_type: string | null
          pool_id: string
          prize_pix_key: string | null
          prize_pix_key_type: string | null
          prize_proof_url: string | null
          prize_sent_at: string | null
          prize_status: string | null
          prize_submitted_at: string | null
          status: Database["public"]["Enums"]["participant_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          guess_value: string
          id?: string
          participant_name: string
          participant_pix_key?: string | null
          payment_proof?: string | null
          pix_consent?: boolean | null
          pix_key_type?: string | null
          pool_id: string
          prize_pix_key?: string | null
          prize_pix_key_type?: string | null
          prize_proof_url?: string | null
          prize_sent_at?: string | null
          prize_status?: string | null
          prize_submitted_at?: string | null
          status?: Database["public"]["Enums"]["participant_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          guess_value?: string
          id?: string
          participant_name?: string
          participant_pix_key?: string | null
          payment_proof?: string | null
          pix_consent?: boolean | null
          pix_key_type?: string | null
          pool_id?: string
          prize_pix_key?: string | null
          prize_pix_key_type?: string | null
          prize_proof_url?: string | null
          prize_sent_at?: string | null
          prize_status?: string | null
          prize_submitted_at?: string | null
          status?: Database["public"]["Enums"]["participant_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_key_access_logs: {
        Row: {
          accessed_at: string
          accessed_by: string
          id: string
          ip_address: string | null
          participant_id: string
          pool_id: string
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          accessed_by: string
          id?: string
          ip_address?: string | null
          participant_id: string
          pool_id: string
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          accessed_by?: string
          id?: string
          ip_address?: string | null
          participant_id?: string
          pool_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pix_key_access_logs_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_key_access_logs_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_payment_info: {
        Row: {
          created_at: string
          id: string
          pix_key: string | null
          pool_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          pix_key?: string | null
          pool_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          pix_key?: string | null
          pool_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_payment_info_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: true
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pools: {
        Row: {
          created_at: string
          deadline: string
          description: string
          entry_fee: number | null
          guess_label: string
          id: string
          is_official: boolean | null
          is_private: boolean
          max_participants: number | null
          measurement_unit: Database["public"]["Enums"]["measurement_unit"]
          owner_id: string
          pool_type: Database["public"]["Enums"]["pool_type"]
          result_value: string | null
          scoring_system: string
          status: Database["public"]["Enums"]["pool_status"]
          title: string
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          deadline: string
          description: string
          entry_fee?: number | null
          guess_label: string
          id?: string
          is_official?: boolean | null
          is_private?: boolean
          max_participants?: number | null
          measurement_unit?: Database["public"]["Enums"]["measurement_unit"]
          owner_id: string
          pool_type?: Database["public"]["Enums"]["pool_type"]
          result_value?: string | null
          scoring_system?: string
          status?: Database["public"]["Enums"]["pool_status"]
          title: string
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          deadline?: string
          description?: string
          entry_fee?: number | null
          guess_label?: string
          id?: string
          is_official?: boolean | null
          is_private?: boolean
          max_participants?: number | null
          measurement_unit?: Database["public"]["Enums"]["measurement_unit"]
          owner_id?: string
          pool_type?: Database["public"]["Enums"]["pool_type"]
          result_value?: string | null
          scoring_system?: string
          status?: Database["public"]["Enums"]["pool_status"]
          title?: string
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pools_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pools_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          created_at: string
          id: string
          total_points: number
          total_pools_created: number
          total_pools_joined: number
          total_wins: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          total_points?: number
          total_pools_created?: number
          total_pools_joined?: number
          total_wins?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          total_points?: number
          total_pools_created?: number
          total_pools_joined?: number
          total_wins?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_football_points: {
        Args: {
          actual_away: number
          actual_home: number
          predicted_away: number
          predicted_home: number
          scoring_system?: string
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_app_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_approved_participant: {
        Args: { pool_uuid: string; user_uuid: string }
        Returns: boolean
      }
      is_pool_finished: {
        Args: { pool_uuid: string }
        Returns: boolean
      }
      is_pool_owner: {
        Args: { pool_uuid: string; user_uuid: string }
        Returns: boolean
      }
      is_user_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      measurement_unit: "kg" | "cm" | "reais" | "units" | "score"
      participant_status: "pending" | "approved" | "rejected" | "awaiting_proof"
      pool_status: "draft" | "active" | "closed" | "finished"
      pool_type: "custom" | "football"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      measurement_unit: ["kg", "cm", "reais", "units", "score"],
      participant_status: ["pending", "approved", "rejected", "awaiting_proof"],
      pool_status: ["draft", "active", "closed", "finished"],
      pool_type: ["custom", "football"],
    },
  },
} as const
