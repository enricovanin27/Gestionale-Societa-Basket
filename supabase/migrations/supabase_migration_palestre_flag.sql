-- Migration: Add solo_allenamento flag to palestre table
-- Run this in the Supabase SQL editor

ALTER TABLE palestre ADD COLUMN IF NOT EXISTS solo_allenamento boolean DEFAULT false;
