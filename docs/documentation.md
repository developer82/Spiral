# Getting Started

## Overview

Welcome to Spiral, a cross-platform SQL client. This documentation covers the main features and usage of the application.

## Installation

Download the latest release for your platform from the releases page. Run the installer and follow the on-screen instructions.

# Explorer

## Connecting to a Database

Open the Explorer page to manage your database connections. Click the **New Connection** button and fill in the connection details for your database provider.

Supported providers include:
- PostgreSQL
- MySQL
- Microsoft SQL Server
- MongoDB
- Redis
- SQLite

## Browsing Tables

Once connected, the left panel shows your database schema. Click on a table to view its columns and data.

## Running Queries

Use the query editor to write and execute SQL queries. Results appear in the results panel below the editor. You can export results to CSV or copy them to the clipboard.

# Compare

## Overview

The Compare page allows you to compare the schema and data between two database connections. This is useful for identifying differences between development, staging, and production environments.

## Running a Comparison

Select a source and target connection, then click **Compare**. The results show added, removed, and modified tables and columns.

## Syncing Changes

Review the comparison results and select the changes you want to sync. Click **Sync** to apply the selected changes to the target database.

# Profiler

## Overview

The Profiler captures query execution on a database connection in real time. Use it to identify slow queries and optimize performance.

## Starting a Profile Session

Go to the Profiler page and select a connection to monitor. Click **Start Profiling** to begin capturing queries.

# Settings

## General

Configure general application preferences such as language and startup behavior.

## Appearance

Choose from available themes and adjust font scaling to suit your display.

## Databases

Manage database driver configuration and default connection settings.
