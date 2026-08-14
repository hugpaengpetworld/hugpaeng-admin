import { RoomPlanningPage } from "@/components/rooms/room-planning-page";

export default function DogRoomsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    date?: string;
    success?: string;
    error?: string;
  }>;
}) {
  return <RoomPlanningPage species="DOG" searchParams={searchParams} />;
}
