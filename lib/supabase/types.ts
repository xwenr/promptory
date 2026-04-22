export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      prompts: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          goal: string;
          model_used: string;
          scene: string;
          goal_clusters: string[];
          images: string[];
          current_ver: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          goal: string;
          model_used: string;
          scene: string;
          goal_clusters: string[];
          images?: string[];
          current_ver?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          goal?: string;
          model_used?: string;
          scene?: string;
          goal_clusters?: string[];
          images?: string[];
          current_ver?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'prompts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      prompt_versions: {
        Row: {
          id: string;
          prompt_id: string;
          ver: number;
          content: string;
          change_note: string;
          is_starred: boolean;
          effect_score: number | null;
          effect_output: string | null;
          effect_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          prompt_id: string;
          ver: number;
          content: string;
          change_note?: string;
          is_starred?: boolean;
          effect_score?: number | null;
          effect_output?: string | null;
          effect_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          change_note?: string;
          is_starred?: boolean;
          effect_score?: number | null;
          effect_output?: string | null;
          effect_notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'prompt_versions_prompt_id_fkey';
            columns: ['prompt_id'];
            isOneToOne: false;
            referencedRelation: 'prompts';
            referencedColumns: ['id'];
          },
        ];
      };
      api_configs: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          api_key: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          api_key: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          provider?: string;
          api_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'api_configs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
