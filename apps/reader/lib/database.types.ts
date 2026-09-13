export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      allowed_reader_emails: {
        Row: {
          email: string;
          created_at: string;
        };
        Insert: {
          email: string;
          created_at?: string;
        };
        Update: {
          email?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      articles: {
        Row: {
          id: string;
          canonical_url: string;
          title: string;
          source: string;
          category: string;
          raw_summary: string;
          first_seen_at: string | null;
          last_seen_at: string | null;
          enrichment_status: string;
          enriched_title: string | null;
          enriched_description: string | null;
          enriched_text: string | null;
          enriched_word_count: number;
          enriched_fetched_at: string | null;
          content_mode: "unknown" | "readable" | "audio_only" | "video_only" | "insufficient_text";
          content_mode_reason: string | null;
          has_audio: boolean;
          has_video: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          canonical_url: string;
          title: string;
          source: string;
          category: string;
          raw_summary?: string;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          enrichment_status?: string;
          enriched_title?: string | null;
          enriched_description?: string | null;
          enriched_text?: string | null;
          enriched_word_count?: number;
          enriched_fetched_at?: string | null;
          content_mode?: "unknown" | "readable" | "audio_only" | "video_only" | "insufficient_text";
          content_mode_reason?: string | null;
          has_audio?: boolean;
          has_video?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          canonical_url?: string;
          title?: string;
          source?: string;
          category?: string;
          raw_summary?: string;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          enrichment_status?: string;
          enriched_title?: string | null;
          enriched_description?: string | null;
          enriched_text?: string | null;
          enriched_word_count?: number;
          enriched_fetched_at?: string | null;
          content_mode?: "unknown" | "readable" | "audio_only" | "video_only" | "insufficient_text";
          content_mode_reason?: string | null;
          has_audio?: boolean;
          has_video?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      digest_runs: {
        Row: {
          id: string;
          report_date: string;
          trigger_type: "manual" | "scheduled";
          status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
          started_by_user_id: string | null;
          started_at: string | null;
          finished_at: string | null;
          error_message: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          report_date: string;
          trigger_type: "manual" | "scheduled";
          status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
          started_by_user_id?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          report_date?: string;
          trigger_type?: "manual" | "scheduled";
          status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
          started_by_user_id?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      digest_recommendation_decisions: {
        Row: {
          id: string;
          digest_run_id: string;
          story_cluster_id: string;
          policy_version: string;
          eligible: boolean;
          selected: boolean;
          eligibility_reasons: Json;
          candidate_rank: number;
          selection_rank: number | null;
          score: number;
          score_components: Json;
          recommendation_reasons: Json;
          selection_reasons: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          digest_run_id: string;
          story_cluster_id: string;
          policy_version: string;
          eligible: boolean;
          selected: boolean;
          eligibility_reasons?: Json;
          candidate_rank: number;
          selection_rank?: number | null;
          score: number;
          score_components?: Json;
          recommendation_reasons?: Json;
          selection_reasons?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          digest_run_id?: string;
          story_cluster_id?: string;
          policy_version?: string;
          eligible?: boolean;
          selected?: boolean;
          eligibility_reasons?: Json;
          candidate_rank?: number;
          selection_rank?: number | null;
          score?: number;
          score_components?: Json;
          recommendation_reasons?: Json;
          selection_reasons?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      digest_run_source_decisions: {
        Row: {
          id: string;
          digest_run_id: string;
          reader_source_id: string;
          policy_version: string;
          portfolio_mode: "manual" | "advisory" | "automatic";
          legacy_enabled: boolean;
          proposed_selected: boolean;
          actual_selected: boolean;
          role: "selected" | "explore" | "probe" | "skipped";
          score: number;
          confidence: number;
          score_components: Json;
          reasons: Json;
          dismissed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          digest_run_id: string;
          reader_source_id: string;
          policy_version: string;
          portfolio_mode: "manual" | "advisory" | "automatic";
          legacy_enabled: boolean;
          proposed_selected: boolean;
          actual_selected: boolean;
          role: "selected" | "explore" | "probe" | "skipped";
          score: number;
          confidence: number;
          score_components?: Json;
          reasons?: Json;
          dismissed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          digest_run_id?: string;
          reader_source_id?: string;
          policy_version?: string;
          portfolio_mode?: "manual" | "advisory" | "automatic";
          legacy_enabled?: boolean;
          proposed_selected?: boolean;
          actual_selected?: boolean;
          role?: "selected" | "explore" | "probe" | "skipped";
          score?: number;
          confidence?: number;
          score_components?: Json;
          reasons?: Json;
          dismissed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      digest_summaries: {
        Row: {
          id: string;
          digest_run_id: string;
          digest_date: string;
          summary: string;
          highlights: Json;
          sections: Json;
          watchlist: Json;
          coverage_note: string;
          reading_time_minutes: number;
          created_at: string;
          updated_at: string;
          generation_kind: "ai" | "fallback" | "legacy";
          generation_reason: string | null;
          model: string | null;
          prompt_version: string | null;
          input_hash: string | null;
        };
        Insert: {
          id?: string;
          digest_run_id: string;
          digest_date: string;
          summary: string;
          highlights?: Json;
          sections?: Json;
          watchlist?: Json;
          coverage_note?: string;
          reading_time_minutes?: number;
          created_at?: string;
          updated_at?: string;
          generation_kind?: "ai" | "fallback" | "legacy";
          generation_reason?: string | null;
          model?: string | null;
          prompt_version?: string | null;
          input_hash?: string | null;
        };
        Update: {
          id?: string;
          digest_run_id?: string;
          digest_date?: string;
          summary?: string;
          highlights?: Json;
          sections?: Json;
          watchlist?: Json;
          coverage_note?: string;
          reading_time_minutes?: number;
          created_at?: string;
          updated_at?: string;
          generation_kind?: "ai" | "fallback" | "legacy";
          generation_reason?: string | null;
          model?: string | null;
          prompt_version?: string | null;
          input_hash?: string | null;
        };
        Relationships: [];
      };
      digest_brief_jobs: {
        Row: { validation_history: Json; validation_report: Json | null; digest_run_id: string; input_payload: Json; input_hash: string; prompt_version: string; status: "pending" | "generating" | "retry_wait" | "generated" | "fallback" | "skipped" | "failed" | "cancelled"; reason: string | null; generation_attempt_count: number; retry_cycle: number; candidate_payload: Json | null; model: string | null; last_error_code: string | null; infrastructure_attempt_count: number; created_at: string; updated_at: string; completed_at: string | null };
        Insert: { validation_history?: Json; validation_report?: Json | null; digest_run_id: string; input_payload: Json; input_hash: string; prompt_version: string; status: "pending" | "generating" | "retry_wait" | "generated" | "fallback" | "skipped" | "failed" | "cancelled"; reason?: string | null; generation_attempt_count?: number; retry_cycle?: number; candidate_payload?: Json | null; model?: string | null; last_error_code?: string | null; infrastructure_attempt_count?: number; created_at?: string; updated_at?: string; completed_at?: string | null };
        Update: Partial<Database["public"]["Tables"]["digest_brief_jobs"]["Insert"]>;
        Relationships: [];
      };
      news_items: {
        Row: {
          id: string;
          external_id: string;
          digest_date: string;
          title: string;
          summary: string;
          source: string;
          source_url: string;
          category: string;
          importance_score: number | null;
          story_cluster_id: string | null;
          editorial_score: number;
          selection_score: number;
          first_selected_at: string | null;
          last_selected_at: string | null;
          last_material_change_at: string | null;
          changed_fields: Json;
          source_count: number;
          source_variants: Json;
          topic_tags: Json;
          entity_tags: Json;
          published_at: string | null;
          raw_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          external_id: string;
          digest_date: string;
          title: string;
          summary: string;
          source: string;
          source_url: string;
          category: string;
          importance_score?: number | null;
          story_cluster_id?: string | null;
          editorial_score?: number;
          selection_score?: number;
          first_selected_at?: string | null;
          last_selected_at?: string | null;
          last_material_change_at?: string | null;
          changed_fields?: Json;
          source_count?: number;
          source_variants?: Json;
          topic_tags?: Json;
          entity_tags?: Json;
          published_at?: string | null;
          raw_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          external_id?: string;
          digest_date?: string;
          title?: string;
          summary?: string;
          source?: string;
          source_url?: string;
          category?: string;
          importance_score?: number | null;
          story_cluster_id?: string | null;
          editorial_score?: number;
          selection_score?: number;
          first_selected_at?: string | null;
          last_selected_at?: string | null;
          last_material_change_at?: string | null;
          changed_fields?: Json;
          source_count?: number;
          source_variants?: Json;
          topic_tags?: Json;
          entity_tags?: Json;
          published_at?: string | null;
          raw_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pipeline_stage_runs: {
        Row: {
          id: string;
          digest_run_id: string;
          stage_name:
            | "source_fetch"
            | "article_normalization"
            | "story_clustering"
            | "enrichment"
            | "editorial_scoring"
            | "reader_publication"
            | "ai_brief"
            | "finalization";
          status: "queued" | "running" | "succeeded" | "failed" | "skipped";
          attempt_count: number;
          started_at: string | null;
          finished_at: string | null;
          error_message: string | null;
          metrics: Json;
          created_at: string;
          updated_at: string;
          next_attempt_at: string | null;
          lease_token: string | null;
          lease_expires_at: string | null;
        };
        Insert: {
          id?: string;
          digest_run_id: string;
          stage_name:
            | "source_fetch"
            | "article_normalization"
            | "story_clustering"
            | "enrichment"
            | "editorial_scoring"
            | "reader_publication"
            | "ai_brief"
            | "finalization";
          status: "queued" | "running" | "succeeded" | "failed" | "skipped";
          attempt_count?: number;
          started_at?: string | null;
          finished_at?: string | null;
          error_message?: string | null;
          metrics?: Json;
          created_at?: string;
          updated_at?: string;
          next_attempt_at?: string | null;
          lease_token?: string | null;
          lease_expires_at?: string | null;
        };
        Update: {
          id?: string;
          digest_run_id?: string;
          stage_name?:
            | "source_fetch"
            | "article_normalization"
            | "story_clustering"
            | "enrichment"
            | "editorial_scoring"
            | "reader_publication"
            | "ai_brief"
            | "finalization";
          status?: "queued" | "running" | "succeeded" | "failed" | "skipped";
          attempt_count?: number;
          started_at?: string | null;
          finished_at?: string | null;
          error_message?: string | null;
          metrics?: Json;
          created_at?: string;
          updated_at?: string;
          next_attempt_at?: string | null;
          lease_token?: string | null;
          lease_expires_at?: string | null;
        };
        Relationships: [];
      };
      reader_notes: {
        Row: {
          id: string;
          user_id: string;
          story_cluster_id: string | null;
          news_item_id: string | null;
          article_id: string | null;
          kind: "knowledge" | "research" | "thought";
          status: "open" | "done";
          note_text: string;
          quote_text: string | null;
          quote_prefix: string | null;
          quote_suffix: string | null;
          title_snapshot: string;
          source_snapshot: string;
          source_url_snapshot: string;
          published_at_snapshot: string | null;
          topic_tags_snapshot: Json;
          entity_tags_snapshot: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          story_cluster_id?: string | null;
          news_item_id?: string | null;
          article_id?: string | null;
          kind: "knowledge" | "research" | "thought";
          status?: "open" | "done";
          note_text?: string;
          quote_text?: string | null;
          quote_prefix?: string | null;
          quote_suffix?: string | null;
          title_snapshot: string;
          source_snapshot: string;
          source_url_snapshot: string;
          published_at_snapshot?: string | null;
          topic_tags_snapshot?: Json;
          entity_tags_snapshot?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          story_cluster_id?: string | null;
          news_item_id?: string | null;
          article_id?: string | null;
          kind?: "knowledge" | "research" | "thought";
          status?: "open" | "done";
          note_text?: string;
          quote_text?: string | null;
          quote_prefix?: string | null;
          quote_suffix?: string | null;
          title_snapshot?: string;
          source_snapshot?: string;
          source_url_snapshot?: string;
          published_at_snapshot?: string | null;
          topic_tags_snapshot?: Json;
          entity_tags_snapshot?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reader_item_states: {
        Row: {
          news_item_id: string;
          user_id: string;
          read_at: string | null;
          saved_at: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          news_item_id: string;
          user_id: string;
          read_at?: string | null;
          saved_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          news_item_id?: string;
          user_id?: string;
          read_at?: string | null;
          saved_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reader_sources: {
        Row: {
          id: string;
          name: string;
          category: string;
          feed_url: string;
          priority: number;
          enabled: boolean;
          selection_mode: "auto" | "always_on" | "blocked";
          normalized_feed_url: string;
          canonical_host: string;
          feed_type: "rss" | "atom" | "unknown";
          language: string;
          validation_status: "unverified" | "valid" | "invalid" | "blocked";
          last_validated_at: string | null;
          validation_diagnostics: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          feed_url: string;
          priority?: number;
          enabled?: boolean;
          selection_mode?: "auto" | "always_on" | "blocked";
          normalized_feed_url?: string;
          canonical_host?: string;
          feed_type?: "rss" | "atom" | "unknown";
          language?: string;
          validation_status?: "unverified" | "valid" | "invalid" | "blocked";
          last_validated_at?: string | null;
          validation_diagnostics?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          feed_url?: string;
          priority?: number;
          enabled?: boolean;
          selection_mode?: "auto" | "always_on" | "blocked";
          normalized_feed_url?: string;
          canonical_host?: string;
          feed_type?: "rss" | "atom" | "unknown";
          language?: string;
          validation_status?: "unverified" | "valid" | "invalid" | "blocked";
          last_validated_at?: string | null;
          validation_diagnostics?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reader_digest_settings: {
        Row: {
          user_id: string;
          publish_top_n: number;
          summary_max_chars: number;
          minimum_importance_score: number;
          feed_targets: Json;
          freshness_window_hours: number;
          max_stories_per_source: number;
          preferred_keywords: Json;
          minimum_source_count: number;
          excluded_keywords: Json;
          require_major_security: boolean;
          use_ai_summaries: boolean;
          readable_only: boolean;
          personalization_enabled: boolean;
          implicit_personalization_enabled: boolean;
          recommendation_policy_mode: "shadow" | "v2" | "v1";
          source_portfolio_mode: "manual" | "advisory" | "automatic";
          source_budget: number;
          source_probe_count: number;
          source_category_minimums: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          publish_top_n?: number;
          summary_max_chars?: number;
          minimum_importance_score?: number;
          feed_targets?: Json;
          freshness_window_hours?: number;
          max_stories_per_source?: number;
          preferred_keywords?: Json;
          minimum_source_count?: number;
          excluded_keywords?: Json;
          require_major_security?: boolean;
          use_ai_summaries?: boolean;
          readable_only?: boolean;
          personalization_enabled?: boolean;
          implicit_personalization_enabled?: boolean;
          recommendation_policy_mode?: "shadow" | "v2" | "v1";
          source_portfolio_mode?: "manual" | "advisory" | "automatic";
          source_budget?: number;
          source_probe_count?: number;
          source_category_minimums?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          publish_top_n?: number;
          summary_max_chars?: number;
          minimum_importance_score?: number;
          feed_targets?: Json;
          freshness_window_hours?: number;
          max_stories_per_source?: number;
          preferred_keywords?: Json;
          minimum_source_count?: number;
          excluded_keywords?: Json;
          require_major_security?: boolean;
          use_ai_summaries?: boolean;
          readable_only?: boolean;
          personalization_enabled?: boolean;
          implicit_personalization_enabled?: boolean;
          recommendation_policy_mode?: "shadow" | "v2" | "v1";
          source_portfolio_mode?: "manual" | "advisory" | "automatic";
          source_budget?: number;
          source_probe_count?: number;
          source_category_minimums?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reader_item_feedback: {
        Row: {
          news_item_id: string;
          user_id: string;
          sentiment: "more" | "less";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          news_item_id: string;
          user_id: string;
          sentiment: "more" | "less";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          news_item_id?: string;
          user_id?: string;
          sentiment?: "more" | "less";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reader_preference_signals: {
        Row: {
          id: string;
          user_id: string;
          story_cluster_id: string;
          dimension: "topic" | "entity" | "source" | "repetition" | "quality";
          target: string;
          reader_source_id: string | null;
          sentiment: "more" | "less";
          origin: "explicit" | "behavioral";
          weight: number;
          confidence: number;
          evidence_count: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          story_cluster_id: string;
          dimension: "topic" | "entity" | "source" | "repetition" | "quality";
          target: string;
          reader_source_id?: string | null;
          sentiment: "more" | "less";
          origin: "explicit" | "behavioral";
          weight?: number;
          confidence?: number;
          evidence_count?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          story_cluster_id?: string;
          dimension?: "topic" | "entity" | "source" | "repetition" | "quality";
          target?: string;
          reader_source_id?: string | null;
          sentiment?: "more" | "less";
          origin?: "explicit" | "behavioral";
          weight?: number;
          confidence?: number;
          evidence_count?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reader_story_feedback: {
        Row: {
          story_cluster_id: string;
          user_id: string;
          sentiment: "more" | "less";
          reason: "topic" | "source" | "repetitive" | "quality";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          story_cluster_id: string;
          user_id: string;
          sentiment: "more" | "less";
          reason?: "topic" | "source" | "repetitive" | "quality";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          story_cluster_id?: string;
          user_id?: string;
          sentiment?: "more" | "less";
          reason?: "topic" | "source" | "repetitive" | "quality";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reader_profiles: {
        Row: {
          user_id: string;
          last_feed_visited_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          last_feed_visited_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          last_feed_visited_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reader_feed_events: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          news_item_id: string | null;
          story_cluster_id: string | null;
          event_type: "impression" | "fast_read" | "source_open" | "read" | "save" | "archive" | "feedback";
          rank: number | null;
          model_rank: number | null;
          sort_mode: "for-you" | "top" | "latest" | null;
          feed: string | null;
          metadata: Json;
          ranking_context_id: string | null;
          policy_version: string | null;
          rank_score: number | null;
          score_components: Json | null;
          recommendation_reasons: Json | null;
          is_exploration: boolean | null;
          interaction_origin: "direct" | "bulk" | "automatic" | null;
          impression_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          news_item_id?: string | null;
          story_cluster_id?: string | null;
          event_type: "impression" | "fast_read" | "source_open" | "read" | "save" | "archive" | "feedback";
          rank?: number | null;
          model_rank?: number | null;
          sort_mode?: "for-you" | "top" | "latest" | null;
          feed?: string | null;
          metadata?: Json;
          ranking_context_id?: string | null;
          policy_version?: string | null;
          rank_score?: number | null;
          score_components?: Json | null;
          recommendation_reasons?: Json | null;
          is_exploration?: boolean | null;
          interaction_origin?: "direct" | "bulk" | "automatic" | null;
          impression_key?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string;
          news_item_id?: string | null;
          story_cluster_id?: string | null;
          event_type?: "impression" | "fast_read" | "source_open" | "read" | "save" | "archive" | "feedback";
          rank?: number | null;
          model_rank?: number | null;
          sort_mode?: "for-you" | "top" | "latest" | null;
          feed?: string | null;
          metadata?: Json;
          ranking_context_id?: string | null;
          policy_version?: string | null;
          rank_score?: number | null;
          score_components?: Json | null;
          recommendation_reasons?: Json | null;
          is_exploration?: boolean | null;
          interaction_origin?: "direct" | "bulk" | "automatic" | null;
          impression_key?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      source_items: {
        Row: {
          id: string;
          digest_run_id: string;
          source_name: string;
          source_url: string;
          category: string;
          raw_payload: Json;
          normalized_url: string | null;
          published_at: string | null;
          reader_source_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          digest_run_id: string;
          source_name: string;
          source_url: string;
          category: string;
          raw_payload: Json;
          normalized_url?: string | null;
          published_at?: string | null;
          reader_source_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          digest_run_id?: string;
          source_name?: string;
          source_url?: string;
          category?: string;
          raw_payload?: Json;
          normalized_url?: string | null;
          published_at?: string | null;
          reader_source_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      source_run_observations: {
        Row: {
          id: string;
          digest_run_id: string;
          reader_source_id: string | null;
          source_name: string;
          source_url: string;
          category: string;
          status: "succeeded" | "failed";
          error_kind: string | null;
          duration_ms: number;
          parsed_item_count: number;
          eligible_item_count: number;
          skipped_old_item_count: number;
          skipped_undated_item_count: number;
          unique_story_count: number;
          selected_story_count: number;
          confirmation_story_count: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          digest_run_id: string;
          reader_source_id?: string | null;
          source_name: string;
          source_url: string;
          category: string;
          status: "succeeded" | "failed";
          error_kind?: string | null;
          duration_ms?: number;
          parsed_item_count?: number;
          eligible_item_count?: number;
          skipped_old_item_count?: number;
          skipped_undated_item_count?: number;
          unique_story_count?: number;
          selected_story_count?: number;
          confirmation_story_count?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          digest_run_id?: string;
          reader_source_id?: string | null;
          source_name?: string;
          source_url?: string;
          category?: string;
          status?: "succeeded" | "failed";
          error_kind?: string | null;
          duration_ms?: number;
          parsed_item_count?: number;
          eligible_item_count?: number;
          skipped_old_item_count?: number;
          skipped_undated_item_count?: number;
          unique_story_count?: number;
          selected_story_count?: number;
          confirmation_story_count?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      story_clusters: {
        Row: {
          id: string;
          story_key: string;
          category: string;
          canonical_title: string;
          canonical_url: string;
          source: string;
          latest_summary: string;
          first_seen_at: string | null;
          last_seen_at: string | null;
          latest_published_at: string | null;
          latest_scores: Json;
          latest_duplicate_count: number;
          confirmation_count: number;
          topic_tags: Json;
          entity_tags: Json;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          story_key: string;
          category: string;
          canonical_title: string;
          canonical_url: string;
          source: string;
          latest_summary?: string;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          latest_published_at?: string | null;
          latest_scores?: Json;
          latest_duplicate_count?: number;
          confirmation_count?: number;
          topic_tags?: Json;
          entity_tags?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          story_key?: string;
          category?: string;
          canonical_title?: string;
          canonical_url?: string;
          source?: string;
          latest_summary?: string;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          latest_published_at?: string | null;
          latest_scores?: Json;
          latest_duplicate_count?: number;
          confirmation_count?: number;
          topic_tags?: Json;
          entity_tags?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      story_cluster_articles: {
        Row: {
          story_cluster_id: string;
          article_id: string;
          first_seen_digest_run_id: string | null;
          last_seen_digest_run_id: string | null;
          match_reason: string;
          match_score: number;
          algorithm_version: string;
          is_canonical: boolean;
          first_seen_at: string;
          last_seen_at: string;
        };
        Insert: {
          story_cluster_id: string;
          article_id: string;
          first_seen_digest_run_id?: string | null;
          last_seen_digest_run_id?: string | null;
          match_reason?: string;
          match_score?: number;
          algorithm_version?: string;
          is_canonical?: boolean;
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Update: {
          story_cluster_id?: string;
          article_id?: string;
          first_seen_digest_run_id?: string | null;
          last_seen_digest_run_id?: string | null;
          match_reason?: string;
          match_score?: number;
          algorithm_version?: string;
          is_canonical?: boolean;
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Relationships: [];
      };
      story_cluster_sources: {
        Row: {
          story_cluster_id: string;
          reader_source_id: string;
          first_seen_digest_run_id: string | null;
          last_seen_digest_run_id: string | null;
          contribution_type: "canonical" | "confirmation";
          first_seen_at: string;
          last_seen_at: string;
        };
        Insert: {
          story_cluster_id: string;
          reader_source_id: string;
          first_seen_digest_run_id?: string | null;
          last_seen_digest_run_id?: string | null;
          contribution_type: "canonical" | "confirmation";
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Update: {
          story_cluster_id?: string;
          reader_source_id?: string;
          first_seen_digest_run_id?: string | null;
          last_seen_digest_run_id?: string | null;
          contribution_type?: "canonical" | "confirmation";
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Relationships: [];
      };
      story_snapshots: {
        Row: {
          id: string;
          digest_run_id: string;
          story_cluster_id: string;
          is_selected: boolean;
          editorial_score: number;
          impact_score: number;
          novelty_score: number;
          confirmation_score: number;
          scope_fit_score: number;
          urgency_score: number;
          duplicate_count: number;
          changed_fields: Json;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          digest_run_id: string;
          story_cluster_id: string;
          is_selected?: boolean;
          editorial_score?: number;
          impact_score?: number;
          novelty_score?: number;
          confirmation_score?: number;
          scope_fit_score?: number;
          urgency_score?: number;
          duplicate_count?: number;
          changed_fields?: Json;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          digest_run_id?: string;
          story_cluster_id?: string;
          is_selected?: boolean;
          editorial_score?: number;
          impact_score?: number;
          novelty_score?: number;
          confirmation_score?: number;
          scope_fit_score?: number;
          urgency_score?: number;
          duplicate_count?: number;
          changed_fields?: Json;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      story_updates: {
        Row: {
          id: string;
          story_cluster_id: string;
          digest_run_id: string;
          changed_fields: Json;
          snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          story_cluster_id: string;
          digest_run_id: string;
          changed_fields?: Json;
          snapshot?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          story_cluster_id?: string;
          digest_run_id?: string;
          changed_fields?: Json;
          snapshot?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      enrichment_records: {
        Row: {
          id: string;
          digest_run_id: string;
          article_id: string;
          status: string;
          fetched_at: string | null;
          error_message: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          digest_run_id: string;
          article_id: string;
          status: string;
          fetched_at?: string | null;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          digest_run_id?: string;
          article_id?: string;
          status?: string;
          fetched_at?: string | null;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
