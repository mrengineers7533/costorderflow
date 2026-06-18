import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";
import { ApprovedBoqListPage, MANUFACTURING_CONFIG } from "../modules/ApprovedBoqModule";

export default function ManufacturingList() {
  return (
    <div className="space-y-2">
      <div className="container mx-auto px-4 lg:px-6 pt-4 flex justify-end">
        <Link to="/manufacturing/boq-folder">
          <Button size="sm" variant="outline" className="gap-2">
            <FolderOpen className="h-4 w-4" /> Open BOQ Folder
          </Button>
        </Link>
      </div>
      <ApprovedBoqListPage config={MANUFACTURING_CONFIG} />
    </div>
  );
}