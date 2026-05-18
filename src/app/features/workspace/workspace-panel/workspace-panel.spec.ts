import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkspacePanel } from './workspace-panel';

describe('WorkspacePanel', () => {
  let component: WorkspacePanel;
  let fixture: ComponentFixture<WorkspacePanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspacePanel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkspacePanel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
