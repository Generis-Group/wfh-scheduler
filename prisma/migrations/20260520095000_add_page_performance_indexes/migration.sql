CREATE INDEX "Account_userId_idx" ON "Account"("userId");

CREATE INDEX "ActivityItem_reportDate_selected_staleAt_source_idx" ON "ActivityItem"("reportDate", "selected", "staleAt", "source");
