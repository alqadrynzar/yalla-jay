package com.yallajay.customerapp.ui.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.yallajay.customerapp.databinding.ItemServiceRegionBinding
import com.yallajay.customerapp.model.ServiceRegion

class ServiceRegionAdapter(
    private val regions: List<ServiceRegion>,
    private val onRegionSelectedCallback: (ServiceRegion?) -> Unit
) : RecyclerView.Adapter<ServiceRegionAdapter.ServiceRegionViewHolder>() {

    var selectedPosition = RecyclerView.NO_POSITION
        private set

    fun getSelectedRegion(): ServiceRegion? {
        return if (selectedPosition != RecyclerView.NO_POSITION && selectedPosition < regions.size) {
            regions[selectedPosition]
        } else {
            null
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ServiceRegionViewHolder {
        val binding = ItemServiceRegionBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ServiceRegionViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ServiceRegionViewHolder, position: Int) {
        val region = regions[position]
        holder.bind(region, position == selectedPosition)
    }

    override fun getItemCount(): Int = regions.size

    inner class ServiceRegionViewHolder(private val binding: ItemServiceRegionBinding) :
        RecyclerView.ViewHolder(binding.root) {

        init {
            val clickListener = View.OnClickListener {
                val currentPosition = adapterPosition
                if (currentPosition != RecyclerView.NO_POSITION) {
                    if (selectedPosition != currentPosition) {
                        val previousSelectedPosition = selectedPosition
                        selectedPosition = currentPosition
                        onRegionSelectedCallback(regions[selectedPosition])

                        if (previousSelectedPosition != RecyclerView.NO_POSITION) {
                            notifyItemChanged(previousSelectedPosition)
                        }
                        notifyItemChanged(selectedPosition)
                    }
                }
            }
            binding.root.setOnClickListener(clickListener)
            binding.regionRadioButton.isClickable = false
        }

        fun bind(region: ServiceRegion, isSelected: Boolean) {
            binding.regionRadioButton.text = region.name
            binding.regionRadioButton.isChecked = isSelected

            if (region.description.isNullOrEmpty()) {
                binding.regionDescriptionTextView.visibility = View.GONE
            } else {
                binding.regionDescriptionTextView.text = region.description
                binding.regionDescriptionTextView.visibility = View.VISIBLE
            }
        }
    }
}
