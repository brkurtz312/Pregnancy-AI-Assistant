import { useState, useEffect } from "react";
import { MapPin, Phone, User, Building2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";

function DirectionButtons({ address }: { address: string }) {
  const encoded = encodeURIComponent(address);
  return (
    <div className="flex gap-2 flex-wrap mt-2">
      <a
        href={`https://maps.apple.com/?q=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          Apple Maps
          <ExternalLink className="w-3 h-3 opacity-50" />
        </Button>
      </a>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          Google Maps
          <ExternalLink className="w-3 h-3 opacity-50" />
        </Button>
      </a>
    </div>
  );
}

export function MyInfo() {
  const { data: profile, isLoading } = useGetProfile();
  const updateMutation = useUpdateProfile();

  const [providerName, setProviderName] = useState("");
  const [providerPhone, setProviderPhone] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalPhone, setHospitalPhone] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setProviderName(profile.providerName ?? "");
      setProviderPhone(profile.providerPhone ?? "");
      setHospitalName(profile.hospitalName ?? "");
      setHospitalPhone(profile.hospitalPhone ?? "");
      setHospitalAddress(profile.hospitalAddress ?? "");
    }
  }, [profile]);

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      data: {
        providerName: providerName.trim() || null,
        providerPhone: providerPhone.trim() || null,
        hospitalName: hospitalName.trim() || null,
        hospitalPhone: hospitalPhone.trim() || null,
        hospitalAddress: hospitalAddress.trim() || null,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-xl mx-auto">
      {/* Provider */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base">
          <User className="w-4 h-4 text-primary" />
          My Provider
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="providerName">Name</Label>
            <Input
              id="providerName"
              placeholder="Dr. Jane Smith"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="providerPhone">Phone</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="providerPhone"
                type="tel"
                placeholder="(555) 000-0000"
                value={providerPhone}
                onChange={(e) => setProviderPhone(e.target.value)}
              />
              {providerPhone && (
                <a href={`tel:${providerPhone}`}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Call
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="border-t border-border/50" />

      {/* Hospital */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold text-base">
          <Building2 className="w-4 h-4 text-primary" />
          My Hospital
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="hospitalName">Name</Label>
            <Input
              id="hospitalName"
              placeholder="City Medical Center"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hospitalPhone">Phone</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="hospitalPhone"
                type="tel"
                placeholder="(555) 000-0000"
                value={hospitalPhone}
                onChange={(e) => setHospitalPhone(e.target.value)}
              />
              {hospitalPhone && (
                <a href={`tel:${hospitalPhone}`}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Call
                  </Button>
                </a>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hospitalAddress">Address</Label>
            <Input
              id="hospitalAddress"
              placeholder="123 Main St, City, State 00000"
              value={hospitalAddress}
              onChange={(e) => setHospitalAddress(e.target.value)}
            />
            {hospitalAddress && <DirectionButtons address={hospitalAddress} />}
          </div>
        </div>
      </section>

      <Button
        onClick={handleSave}
        disabled={updateMutation.isPending}
        className="w-full"
      >
        {saved ? "Saved ✓" : updateMutation.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
