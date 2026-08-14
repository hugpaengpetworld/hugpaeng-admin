import { RoomPlanningPage } from "@/components/rooms/room-planning-page";

export default function CatRoomsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    date?: string;
    success?: string;
    error?: string;
  }>;
}) {
  return <RoomPlanningPage species="CAT" searchParams={searchParams} />;
}
