import { PathaoSettings } from "@/components/erp/courier/pathao-settings";
import { SteadfastSettings } from "@/components/erp/courier/steadfast-settings";
import { CourierMappingSettings } from "@/components/erp/settings/courier-mapping-settings";
import { InstapaySettings } from "@/components/erp/settings/instapay-settings";
import { BdCourierSettings } from "@/components/erp/settings/bdcourier-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentRole } from "@/hooks/use-current-role";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock } from "lucide-react";

export function CourierSection({ brandId }: { brandId: string }) {
  const { isAdmin } = useCurrentRole();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Courier Settings</h2>
        <p className="text-xs text-muted-foreground">Credentials, store mapping and status overrides per provider.</p>
      </div>

      {!isAdmin && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>API credentials are admin-only. You can still view status mappings.</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="pathao" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pathao">Pathao</TabsTrigger>
          <TabsTrigger value="steadfast">Steadfast</TabsTrigger>
          <TabsTrigger value="bdcourier">BDCourier</TabsTrigger>
          <TabsTrigger value="mapping">Status Mapping</TabsTrigger>
        </TabsList>
        <TabsContent value="pathao">
          {isAdmin ? (
            <div className="space-y-4">
              <PathaoSettings key={brandId} />
              <InstapaySettings brandId={brandId} />
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Hidden — admin only.</div>
          )}
        </TabsContent>
        <TabsContent value="steadfast">
          {isAdmin ? (
            <SteadfastSettings key={brandId} />
          ) : (
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Hidden — admin only.</div>
          )}
        </TabsContent>
        <TabsContent value="bdcourier">
          {isAdmin ? (
            <BdCourierSettings />
          ) : (
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Hidden — admin only.</div>
          )}
        </TabsContent>
        <TabsContent value="mapping">
          <CourierMappingSettings key={brandId} brandIdOverride={brandId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
